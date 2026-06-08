/**
 * Gemini provider adapter.
 * Uses @google/genai (new official SDK).
 */

import { GoogleGenAI, Type } from '@google/genai';
import type {
  AIProviderAdapter,
  AIAnalysisRequest,
  AIAnalysisResult,
} from './types';
import { AIProviderError } from './types';
import { logger } from '../../config/logger';

const DEFAULT_MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `Sen profesyonel bir klinik beslenme uzmanı ve gıda tanıma yapay zekasısın.
Verilen görsel(ler)deki yiyecekleri analiz et.
Tespit edilen yemek adlarını Türkçeye çevir.
Besin değerlerini (kalori, protein, karbonhidrat, yağ, lif, şeker, sodyum) 100 GRAM başına hesapla.
Tabağın kompozisyonuna göre her yiyecek için porsiyon gramajını tahmin et.
Ayrıca, öğünün besin kompozisyonuna dayalı olarak 120 karakterin altında, Türkçe, profesyonel ve kısa bir klinik tavsiye (smartInsight) üret.

Yalnızca aşağıdaki JSON yapısında döndür, markdown veya backtick KULLANMA:
{
  "items": [
    {
      "name": "Yemek adı Türkçe",
      "confidence": 0.95,
      "estimatedPortionGrams": 250,
      "caloriesPer100g": 85,
      "proteinPer100g": 4.5,
      "carbsPer100g": 12,
      "fatPer100g": 2.1,
      "fiberPer100g": 3.2,
      "sugarPer100g": 1.5,
      "sodiumPer100g": 0.4
    }
  ],
  "mealCategory": "breakfast",
  "smartInsight": "Kısa klinik tavsiye Türkçe"
}

Öğün kategorileri: breakfast, lunch, dinner, snack.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          estimatedPortionGrams: { type: Type.NUMBER },
          caloriesPer100g: { type: Type.NUMBER },
          proteinPer100g: { type: Type.NUMBER },
          carbsPer100g: { type: Type.NUMBER },
          fatPer100g: { type: Type.NUMBER },
          fiberPer100g: { type: Type.NUMBER },
          sugarPer100g: { type: Type.NUMBER },
          sodiumPer100g: { type: Type.NUMBER },
        },
        required: ['name', 'confidence', 'estimatedPortionGrams', 'caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'],
      },
    },
    mealCategory: { type: Type.STRING, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
    smartInsight: { type: Type.STRING },
  },
  required: ['items', 'mealCategory'],
};

export class GeminiAdapter implements AIProviderAdapter {
  readonly slug = 'gemini-flash';
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.generateContent({
        model: this.model,
        contents: 'ping',
        config: { maxOutputTokens: 5 },
      });
      return true;
    } catch (err) {
      logger.warn('Gemini test connection failed', { err: (err as Error).message });
      return false;
    }
  }

  async analyze(req: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const start = Date.now();
    try {
      const contents = this.buildContents(req);

      const response = await this.client.models.generateContent({
        model: this.model,
        // The SDK's `contents` type is complex; buildContents returns valid Gemini content shapes.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: contents as any,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      });

      const text = response.text ?? '';
      if (!text) throw new AIProviderError(this.slug, 502, 'Empty response from Gemini');

      const parsed = JSON.parse(text);
      const latencyMs = Date.now() - start;

      // Token usage from usageMetadata
      const usage = response.usageMetadata;
      const inputTokens = usage?.promptTokenCount ?? 0;
      const outputTokens = usage?.candidatesTokenCount ?? 0;

      return {
        items: (parsed.items ?? []).map((item: Record<string, unknown>, i: number) => ({
          id: `gemini-${Date.now()}-${i}`,
          name: String(item.name ?? 'Bilinmeyen'),
          confidence: Math.min(Math.max(Number(item.confidence ?? 0.5), 0), 1),
          estimatedPortionGrams: Number(item.estimatedPortionGrams ?? 100),
          caloriesPer100g: Number(item.caloriesPer100g ?? 0),
          proteinPer100g: Number(item.proteinPer100g ?? 0),
          carbsPer100g: Number(item.carbsPer100g ?? 0),
          fatPer100g: Number(item.fatPer100g ?? 0),
          fiberPer100g: item.fiberPer100g !== undefined ? Number(item.fiberPer100g) : undefined,
          sugarPer100g: item.sugarPer100g !== undefined ? Number(item.sugarPer100g) : undefined,
          sodiumPer100g: item.sodiumPer100g !== undefined ? Number(item.sodiumPer100g) : undefined,
          isVerified: Number(item.confidence ?? 0) >= 0.95,
        })),
        mealCategory: this.normalizeMealCategory(parsed.mealCategory),
        smartInsight: parsed.smartInsight ? String(parsed.smartInsight) : undefined,
        inputTokens,
        outputTokens,
        latencyMs,
        model: this.model,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      logger.error('Gemini analyze failed', { err: (err as Error).message });
      throw new AIProviderError(this.slug, 502, `Gemini error: ${(err as Error).message}`);
    }
  }

  private buildContents(req: AIAnalysisRequest): unknown[] {
    if (req.imageBase64) {
      return [
        {
          inlineData: {
            mimeType: req.imageMimeType ?? 'image/jpeg',
            data: req.imageBase64,
          },
        },
        req.text ?? 'Bu görseldeki yemeği analiz et.',
      ];
    }
    if (req.text) {
      return [`Kullanıcının tarifi: ${req.text}`];
    }
    throw new AIProviderError(this.slug, 400, 'No image or text provided');
  }

  private normalizeMealCategory(value: unknown): AIAnalysisResult['mealCategory'] {
    const valid = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    return (valid as readonly string[]).includes(String(value))
      ? (value as AIAnalysisResult['mealCategory'])
      : 'snack';
  }
}
