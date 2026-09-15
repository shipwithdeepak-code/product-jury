import { GoogleGenAI, Type } from '@google/genai';

let genAIClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required.');
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

export const MODELS_TO_TRY = [
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
];

export function isTransientError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const status = err?.status || err?.code;
  return (
    status === 503 ||
    status === 429 ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset')
  );
}

export interface InvokeGeminiJsonOptions {
  systemInstruction: string;
  prompt: string;
  schema: any;
  temperature?: number;
  imageBase64?: string;
  mimeType?: string;
  agentLabel?: string;
}

export async function invokeGeminiJson<T>(options: InvokeGeminiJsonOptions): Promise<T> {
  const {
    systemInstruction,
    prompt,
    schema,
    temperature = 0.25,
    imageBase64,
    mimeType = 'image/png',
    agentLabel = 'Agent',
  } = options;

  const ai = getGenAI();

  const parts: any[] = [];

  // Parse and attach image if provided
  if (imageBase64 && imageBase64.trim().length > 0) {
    let cleanBase64 = imageBase64;
    let detectedMime = mimeType;

    if (imageBase64.startsWith('data:')) {
      const matches = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        detectedMime = matches[1];
        cleanBase64 = matches[2];
      } else {
        const commaIndex = imageBase64.indexOf(',');
        if (commaIndex !== -1) {
          cleanBase64 = imageBase64.substring(commaIndex + 1);
        }
      }
    }

    parts.push({
      inlineData: {
        mimeType: detectedMime,
        data: cleanBase64,
      },
    });
  }

  parts.push({
    text: prompt,
  });

  const requestPayload = {
    contents: {
      parts,
    },
    config: {
      systemInstruction,
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  let lastError: any = null;

  for (const modelName of MODELS_TO_TRY) {
    let attemptsForThisModel = 0;
    const maxAttemptsForModel = 2;

    while (attemptsForThisModel < maxAttemptsForModel) {
      attemptsForThisModel++;
      try {
        console.log(`[${agentLabel}] Invoking model: ${modelName} (attempt ${attemptsForThisModel}/${maxAttemptsForModel})`);
        const response = await ai.models.generateContent({
          model: modelName,
          ...requestPayload,
        });

        const responseText = response.text;
        if (!responseText) {
          throw new Error(`${agentLabel} returned an empty response.`);
        }

        const parsed: T = JSON.parse(responseText);
        return parsed;
      } catch (error: any) {
        lastError = error;
        const transient = isTransientError(error);
        console.warn(
          `[${agentLabel}] Model ${modelName} attempt ${attemptsForThisModel} failed (${transient ? 'transient' : 'error'}):`,
          error?.message || error
        );

        if (transient && attemptsForThisModel < maxAttemptsForModel) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error(`[${agentLabel}] All Gemini models failed to respond.`);
}

export { Type };
