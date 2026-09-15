import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { analyzeArtifactWithGemini, compareContextWithGemini } from './server/contextAnalystService';
import { runProductJuryDeliberation } from './server/orchestrator';

const PORT = 3000;

async function startServer() {
  const app = express();

  // Middleware for parsing JSON with generous payload limit for screenshot base64
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Multimodal Context Analyst: Visual Artifact-Only Analysis
  app.post('/api/context/analyze', async (req, res) => {
    try {
      const { image, mimeType, fileName } = req.body;

      if (!image) {
        return res.status(400).json({
          success: false,
          error: 'Missing required "image" field (base64 image or data URL).',
        });
      }

      const analysis = await analyzeArtifactWithGemini({
        imageBase64: image,
        mimeType,
        fileName,
      });

      return res.json({
        success: true,
        data: analysis,
      });
    } catch (error: any) {
      console.error('Server error in /api/context/analyze:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to analyze artifact with Gemini.',
      });
    }
  });

  // Multimodal Context Alignment: Explicit PM Context Comparison
  app.post('/api/context/compare', async (req, res) => {
    try {
      const { image, mimeType, fileName, contextClaim, visualFindings } = req.body;

      if (!image) {
        return res.status(400).json({
          success: false,
          error: 'Missing required "image" field (base64 image or data URL).',
        });
      }

      if (!contextClaim || !contextClaim.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Missing required "contextClaim" field. PM context cannot be empty.',
        });
      }

      const alignment = await compareContextWithGemini({
        imageBase64: image,
        mimeType,
        fileName,
        contextClaim: contextClaim.trim(),
        visualFindings,
      });

      return res.json({
        success: true,
        data: alignment,
      });
    } catch (error: any) {
      console.error('Server error in /api/context/compare:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to compare context with Gemini.',
      });
    }
  });

  // Multimodal Multi-Agent Product Jury Deliberation
  app.post('/api/jury/deliberate', async (req, res) => {
    try {
      const { context, rawEvidence } = req.body;

      if (!context) {
        return res.status(400).json({
          success: false,
          error: 'Missing required "context" field in deliberation payload.',
        });
      }

      const review = await runProductJuryDeliberation({
        context,
        rawEvidence,
      });

      return res.json({
        success: true,
        data: review,
      });
    } catch (error: any) {
      console.error('Server error in /api/jury/deliberate:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to execute multi-agent jury deliberation.',
      });
    }
  });

  // Vite middleware in dev; static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Product Jury server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
