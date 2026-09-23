import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { analyzeArtifactWithGemini, compareContextWithGemini } from './server/contextAnalystService';
import { runProductJuryDeliberation } from './server/orchestrator';
import { proposeDecisionQuestion } from './server/agents/decisionQuestionAgent';
import { serializeDecision } from './server/decision/serialization';
import type { DecisionQuestionOffer } from './src/types';
import { ProductJuryError, classifyProviderError, isProductJuryError } from './server/integrity/errors';
import { DecisionBudget } from './server/integrity/budget';
import { RunRecorder } from './server/integrity/provenance';
import { projectUnderstanding } from './server/claims/specialistInput';
import { PAYLOAD_LIMITS, boundedText } from './server/integrity/payload';
import { rateLimit } from './server/integrity/rateLimit';
import { sharedCounters, validateEvent, TelemetryEvent } from './server/integrity/telemetry';
import { isFailed, isInsufficient } from './server/integrity/outcome';

const PORT = 3000;

/**
 * Stage 1 · The API layer.
 *
 * Three things changed at this boundary:
 *
 *  1. SR-4. A route used to answer with `error?.message` from the provider.
 *     Every response now carries a taxonomy code and the user-facing sentence
 *     that belongs to it. Provider payloads, stacks and paths stay server-side.
 *  2. FR-41. Every response says which of the three outcomes it is —
 *     `VERDICT`, `INSUFFICIENT` or `FAILED` — so the client renders them
 *     differently rather than inferring from a status code.
 *  3. SR-3, SR-6, NFR-9. Usage limits, payload bounds and a per-decision cost
 *     ceiling are enforced here, and hitting one is a named, honest state.
 *
 * PR-6: nothing logged from these routes contains artifact or decision content.
 */

function sendFailure(res: express.Response, error: unknown, stage?: string): void {
  const pjError = isProductJuryError(error) ? error : classifyProviderError(error, stage);

  // PR-6 and SR-4: the code and the stage are logged; the payload is not.
  console.error(
    `[api] failure code=${pjError.code} stage=${pjError.stage ?? stage ?? 'unknown'} retryable=${pjError.retryable}`
  );

  res.status(pjError.status).json({
    success: false,
    outcome: 'FAILED',
    code: pjError.code,
    error: pjError.userMessage,
    retryable: pjError.retryable,
    stage: pjError.stage ?? stage,
  });
}

async function startServer() {
  const app = express();

  app.disable('x-powered-by');

  // The body limit is a hard bound, not a convenience. The previous value was
  // 30 MB with nothing else checking anything.
  app.use(express.json({ limit: PAYLOAD_LIMITS.maxBodyBytes }));
  app.use(express.urlencoded({ extended: true, limit: PAYLOAD_LIMITS.maxBodyBytes }));

  // express.json throws a typed error when the body is over the limit; it is
  // translated into the taxonomy rather than reaching a default handler.
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return sendFailure(res, new ProductJuryError('PAYLOAD_TOO_LARGE'));
    }
    if (err instanceof SyntaxError) {
      return sendFailure(res, new ProductJuryError('INVALID_REQUEST'));
    }
    return next(err);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * CAP-01. Returns the artifact reading, or a named failure. Never a reading
   * the product did not derive.
   */
  app.post('/api/context/analyze', rateLimit('analyze'), async (req, res) => {
    const recorder = new RunRecorder();
    const budget = new DecisionBudget();
    try {
      const { image, mimeType, fileName } = req.body ?? {};
      const boundedFileName = boundedText(fileName, 'fileName', 256, 'analyst');

      const { analysis, observations, spine, originCoverage } = await analyzeArtifactWithGemini({
        imageBase64: image,
        mimeType,
        fileName: boundedFileName || undefined,
        budget,
        recorder,
      });

      /*
       * Stage 4 · CAP-04 behaviour 1, proposed here rather than behind a route
       * of its own.
       *
       * The trigger is "after understanding, before any judgement", and the
       * understanding is the spine that has just been built. Proposing here
       * means the question is read off the statements that exist in this
       * process, in this run, under this recorder — no second artifact
       * analysis, and no round trip that would have to send the spine back to
       * the server to be revalidated.
       *
       * A failure here does NOT fail the reading. CAP-04's failure state is
       * "the PM writes it unaided with an example shown. The requirement is
       * never waived" — so the reading is returned with the real reason the
       * proposal is absent, and the workspace puts the PM on the manual path.
       * Nothing is generated locally to stand in for the model.
       */
      let decisionQuestion: DecisionQuestionOffer;
      try {
        decisionQuestion = {
          proposal: await proposeDecisionQuestion({ spine, budget, recorder }),
          unavailable: null,
        };
      } catch (error) {
        const pjError = isProductJuryError(error)
          ? error
          : classifyProviderError(error, 'decision_question');
        console.error(`[api] question proposal unavailable code=${pjError.code}`);
        decisionQuestion = {
          proposal: null,
          unavailable: { code: pjError.code, userMessage: pjError.userMessage },
        };
      }

      return res.json({
        success: true,
        outcome: 'VERDICT',
        data: analysis,
        /*
         * Stage 2 · The display projection is built here, from the spine, so
         * there is one projection in the product rather than one on each side
         * of the wire. The spine travels inside it.
         */
        understanding: projectUnderstanding(spine, analysis),
        originCoverage,
        // CAP-04: a proposal, or the honest absence of one. Never both, and
        // never a sentence the product composed.
        decisionQuestion,
        // SR-8: instructions found in the input travel to the client as
        // observations about the input.
        observations,
        provenance: recorder.snapshot(),
      });
    } catch (error) {
      return sendFailure(res, error, 'analyst');
    }
  });

  /**
   * The explicit context comparison. An alignment is only ever returned when
   * one was actually assessed.
   */
  app.post('/api/context/compare', rateLimit('analyze'), async (req, res) => {
    const recorder = new RunRecorder();
    const budget = new DecisionBudget();
    try {
      const { image, mimeType, fileName, contextClaim, visualFindings } = req.body ?? {};

      const alignment = await compareContextWithGemini({
        imageBase64: image,
        mimeType,
        fileName: boundedText(fileName, 'fileName', 256, 'context_alignment') || undefined,
        contextClaim,
        visualFindings,
        budget,
        recorder,
      });

      return res.json({
        success: true,
        outcome: 'VERDICT',
        data: alignment,
        provenance: recorder.snapshot(),
      });
    } catch (error) {
      return sendFailure(res, error, 'context_alignment');
    }
  });

  /**
   * The deliberation. Answers with one of the three outcomes, explicitly
   * labelled (FR-41), and carries the run provenance so the client can show
   * which stages ran (TR-4) instead of simulating them (NFR-4).
   */
  app.post('/api/jury/deliberate', rateLimit('deliberate'), async (req, res) => {
    try {
      const { context, rawEvidence, decisionQuestion } = req.body ?? {};

      if (!context || typeof context !== 'object') {
        throw new ProductJuryError('INVALID_REQUEST', { detail: { field: 'context' } });
      }

      /*
       * CAP-04, FR-4. Required before any judgement, and bounded like every
       * other supplied string. It is read off the request rather than off
       * `context`: the question belongs to the decision, not to the product.
       */
      const boundedQuestion = boundedText(
        decisionQuestion,
        'decisionQuestion',
        PAYLOAD_LIMITS.maxContextFieldChars,
        'chair'
      );
      if (!boundedQuestion) {
        throw new ProductJuryError('INVALID_REQUEST', { detail: { field: 'decisionQuestion' } });
      }

      const boundedEvidence = boundedText(
        rawEvidence,
        'rawEvidence',
        PAYLOAD_LIMITS.maxEvidenceChars,
        'chair'
      );
      for (const field of [
        'name',
        'whatBuilding',
        'targetUser',
        'primaryGoal',
        'currentProblem',
        'additionalContext',
      ] as const) {
        boundedText(context[field], field, PAYLOAD_LIMITS.maxContextFieldChars, 'chair');
      }

      const outcome = await runProductJuryDeliberation({
        context,
        decisionQuestion: boundedQuestion,
        rawEvidence: boundedEvidence || undefined,
      });

      if (isFailed(outcome)) {
        const status = new ProductJuryError(outcome.code).status;
        console.error(`[api] deliberation failed code=${outcome.code} stage=${outcome.stage ?? 'unknown'}`);
        return res.status(status).json({
          success: false,
          outcome: 'FAILED',
          code: outcome.code,
          error: outcome.userMessage,
          retryable: outcome.retryable,
          stage: outcome.stage,
          provenance: outcome.provenance,
        });
      }

      if (isInsufficient(outcome)) {
        // CAP-07: a refusal is a complete outcome and answers 200. It is not an
        // error, and it is never produced by a catch block — see
        // server/integrity/outcome.ts.
        return res.status(200).json({
          success: true,
          outcome: 'INSUFFICIENT',
          refusedAt: outcome.refusedAt,
          missing: outcome.missing,
          provenance: outcome.provenance,
        });
      }

      /*
       * Stage 4 · The successful run IS a Decision now (§17, CAP-12). It is
       * serialized through the Stage 3 validator on the way out, so a Decision
       * that does not satisfy its own schema never reaches a client.
       *
       * `data` remains the review because the existing surfaces read it. It is
       * the same verdict that is inside version 1 of the decision beside it,
       * not a second one — see server/orchestrator.ts.
       */
      return res.json({
        success: true,
        outcome: 'VERDICT',
        data: outcome.data.review,
        decision: serializeDecision(outcome.data.decision),
        provenance: outcome.provenance,
      });
    } catch (error) {
      return sendFailure(res, error, 'chair');
    }
  });

  /**
   * §55. Content-free events only. A payload carrying a field outside the
   * whitelist is rejected, not stripped (TEL-2, TEL-10).
   *
   * The store keeps counters, not rows, which is what makes TEL-9's disclosure
   * true: there is no per-decision record to delete.
   */
  app.post('/api/telemetry', rateLimit('telemetry'), (req, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    if (events.length === 0 || events.length > 50) {
      return sendFailure(res, new ProductJuryError('INVALID_REQUEST', { detail: { field: 'events' } }));
    }

    const rejected: { index: number; errors: string[] }[] = [];
    events.forEach((event: unknown, index: number) => {
      const result = validateEvent(event);
      if (!result.valid) {
        rejected.push({ index, errors: result.errors });
        return;
      }
      sharedCounters.record(event as TelemetryEvent);
    });

    if (rejected.length > 0) {
      console.error(`[telemetry] rejected ${rejected.length} event(s) for schema violations`);
      return res.status(400).json({
        success: false,
        outcome: 'FAILED',
        code: 'INVALID_REQUEST',
        error: 'One or more events did not match the content-free event schema and were rejected.',
        rejected,
      });
    }

    return res.status(202).json({ success: true, accepted: events.length });
  });

  /**
   * TEL-5: guardrail metrics are visible by default, not behind a query
   * somebody has to remember to run.
   */
  app.get('/api/telemetry/counters', (_req, res) => {
    res.json({
      success: true,
      counters: sharedCounters.snapshot(),
      latency: {
        verdict_issued: sharedCounters.latency('verdict_issued'),
        gate_refused: sharedCounters.latency('gate_refused'),
        ceiling_refused: sharedCounters.latency('ceiling_refused'),
      },
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Anything that reaches here is a defect. SR-4: the user is told that, and
  // nothing else.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendFailure(res, err);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Product Jury server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
