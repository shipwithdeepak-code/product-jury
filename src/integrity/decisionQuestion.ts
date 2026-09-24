/**
 * Stage 4 · CAP-04. Is this sentence a decision?
 *
 * PRD v1.1.1 CAP-04 (§21), FR-4, FR-4a, FR-4b, §56.1.
 *
 * CAP-04 behaviour 3: "Detects a weak or non-decision question — 'is this
 * good?', 'what do you think?', 'review this screen'."
 *
 * WHY THIS IS DETERMINISTIC AND NOT A MODEL CALL.
 *
 * The PM may write their own question, and they may write it when generation
 * has failed and there is no model in the loop at all (behaviour 5). A check
 * that only runs on the model's own proposal would never see the sentence that
 * matters most. So the check is local, runs on whatever text is in play, and
 * costs nothing.
 *
 * WHAT IT DOES NOT DO. It never blocks. CAP-04 says detect and offer a sharper
 * alternative; the PM decides. It also makes no claim to judge whether a
 * decision is a *good* decision — it reads the shape of the sentence, which is
 * all a string match can honestly do, and the comments below say so where a
 * reader might assume otherwise.
 *
 * This module is pure and has no dependencies, so the server and the browser
 * run the same check rather than two that can disagree.
 */

/**
 * The three the PRD names, verbatim, plus the near-neighbours of each. Matched
 * against the whole trimmed sentence, not as substrings: "should we review this
 * screen before launch" contains "review this screen" and is a real decision.
 */
const NON_DECISION_SENTENCES: readonly RegExp[] = Object.freeze([
  /^is (this|it) (any )?good\??$/i,
  /^what do you think(\s+of\s+(this|it))?\??$/i,
  /^review (this|the) (screen|design|page|flow|artifact|ui)\.?$/i,
  /^(any )?(thoughts|feedback|opinions)(\s+on\s+(this|it))?\??$/i,
  /^(please )?(take a look|have a look)(\s+at\s+(this|it))?\.?$/i,
  /^how (is|does) (this|it) (look|seem)\??$/i,
  /^what('s| is) wrong with (this|it)\??$/i,
]);

/**
 * A sentence that puts a call to someone. The PRD's own example is "Should we
 * ship the redesigned export flow before the Q4 freeze?", and the shapes below
 * are the ordinary ways of writing that: a decision modal, or an explicit
 * either/or.
 */
const DECISION_SHAPES: readonly RegExp[] = Object.freeze([
  /\bshould (we|i|they|the team)\b/i,
  /\b(do|can|must|ought) we\b/i,
  /\bis it worth\b/i,
  /\bare we (ready|right) to\b/i,
  /\bwhich (should|do) we\b/i,
  /\b(ship|build|redesign|rebuild|keep|kill|launch|delay|invest|rewrite|remove|change)\b.*\bor\b/i,
]);

export interface DecisionQuestionAssessment {
  /** Whether the sentence reads as a call being made. */
  isDecisionShaped: boolean;
  /**
   * Why not, in the PM's language, when it is not. `null` when the sentence is
   * decision-shaped. Never a score and never a grade.
   */
  weakness: string | null;
}

const NOT_A_DECISION =
  'This asks for an opinion rather than naming a call. A decision question says what you are ' +
  'deciding — "Should we …?" — so the verdict has something to be right or wrong about.';

const NO_CALL_NAMED =
  'This does not name a call. A decision question says what you would do differently depending ' +
  'on the answer.';

const TOO_SHORT =
  'This is too short to name a call. A decision question says what is being decided and by when.';

/**
 * Assess the sentence currently in play. Runs on the model's proposal and on
 * anything the PM types, including when no model ran.
 */
export function assessDecisionQuestion(text: string): DecisionQuestionAssessment {
  const trimmed = (text ?? '').trim();

  if (trimmed.length === 0) {
    return { isDecisionShaped: false, weakness: TOO_SHORT };
  }

  for (const pattern of NON_DECISION_SENTENCES) {
    if (pattern.test(trimmed)) return { isDecisionShaped: false, weakness: NOT_A_DECISION };
  }

  // Short enough that it cannot be naming an action, a subject and a horizon.
  if (trimmed.split(/\s+/).length < 4) {
    return { isDecisionShaped: false, weakness: TOO_SHORT };
  }

  for (const shape of DECISION_SHAPES) {
    if (shape.test(trimmed)) return { isDecisionShaped: true, weakness: null };
  }

  return { isDecisionShaped: false, weakness: NO_CALL_NAMED };
}

/**
 * §56.1's "question_confirmed carrying an edit-distance flag", for CAP-04's
 * ≥85% "accept or lightly edit" criterion.
 *
 * A band, not a distance: §55 permits `editDistanceBand` with exactly the three
 * values below and nothing finer. A raw distance over a short sentence starts
 * to describe the sentence, which is decision content.
 *
 * `unedited` is character-identical after trimming. The split between `light`
 * and `heavy` is Levenshtein distance over a fifth of the proposal's length —
 * a wording change rather than a different question. That boundary is a choice
 * this build makes, not a PRD number; the PRD fixes the metric and the ≥85%
 * bar, and leaves what counts as "lightly edited" unstated.
 */
export const LIGHT_EDIT_RATIO = 0.2;

/** §55's `editDistanceBand` enum, verbatim and complete. */
export type EditDistanceBand = 'unedited' | 'light' | 'heavy';

export function editDistanceBand(
  proposed: string | null | undefined,
  confirmed: string
): EditDistanceBand {
  const before = (proposed ?? '').trim();
  const after = (confirmed ?? '').trim();

  // The PM wrote it themselves; there was no proposal to edit.
  if (before.length === 0) return 'heavy';
  if (before === after) return 'unedited';

  const distance = levenshtein(before, after);
  return distance <= Math.max(1, Math.round(before.length * LIGHT_EDIT_RATIO)) ? 'light' : 'heavy';
}

/** Two rows, because the sentences are short and nothing needs the matrix. */
function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * CAP-04's failure state: "the PM writes it unaided with an example shown".
 *
 * The PRD's own example sentence, verbatim (§21, CAP-04 Input). It is shown as
 * an example and is never pre-filled into the field: a sentence the PM did not
 * write is not their decision question, and a product that fills it in for
 * them has manufactured the one thing CAP-04 exists to make them state.
 */
export const QUESTION_EXAMPLE = 'Should we ship the redesigned export flow before the Q4 freeze?';
