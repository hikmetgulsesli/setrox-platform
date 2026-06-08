/**
 * Kimi (Moonshot AI) provider adapter.
 * API: https://api.kimi.com/coding/v1/messages
 * Uses Claude-compatible messages format.
 */

import type {
  AIProviderAdapter,
  AIAnalysisRequest,
  AIAnalysisResult,
} from './types';
import { AIProviderError } from './types';
import { logger } from '../../config/logger';

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1';
const DEFAULT_MODEL = 'kimi-k2';

const SYSTEM_PROMPT = `You are a professional clinical nutrition expert and food recognition AI.
Analyze the food in the provided image(s).
Translate all detected food names into Turkish.
Calculate nutritional values (calories, protein, carbs, fat, fiber, sugar, sodium) PER 100g.
Estimate the portion size (in grams) for each item based on the plate composition.
Also, generate a brief, professional clinical advice in Turkish (under 120 characters) in "smartInsight".

Return ONLY a JSON object with this exact structure:
{
  "items": [
    { "name": "Food name in Turkish", "confidence": 0.95, "estimatedPortionGrams": 250,
      "caloriesPer100g": 85, "proteinPer100g": 4.5, "carbsPer100g": 12, "fatPer100g": 2.1,
      "fiberPer100g": 3.2, "sugarPer100g": 1.5, "sodiumPer100g": 0.4 }
  ],
  "mealCategory": "breakfast",
  "smartInsight": "..."
}

Meal categories: breakfast, lunch, dinner, snack. Return ONLY JSON.`;

export class KimiAdapter implements AIProviderAdapter {
  readonly slug = 'kimi';
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(
    apiKey: string,
    baseUrl: string = DEFAULT_BASE_URL,
    model: string = DEFAULT_MODEL,
  ) {
    if (!apiKey) throw new Error('Kimi API key is required');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      return res.ok;
    } catch (err) {
      logger.warn('Kimi test connection failed', { err: (err as Error).message });
      return false;
    }
  }

  async analyze(req: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const start = Date.now();
    try {
      const userContent = this.buildUserContent(req);
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new AIProviderError(
          this.slug,
          response.status,
          `Kimi error ${response.status}: ${text}`,
        );
      }

      const json = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = json.content?.[0]?.text ?? '';
      if (!text) throw new AIProviderError(this.slug, 502, 'Empty response from Kimi');

      // Strip markdown code blocks if present
      const cleanText = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanText);
      const latencyMs = Date.now() - start;

      return {
        items: (parsed.items ?? []).map((item: Record<string, unknown>, i: number) => ({
          id: `kimi-${Date.now()}-${i}`,
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
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        latencyMs,
        model: this.model,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      logger.error('Kimi analyze failed', { err: (err as Error).message });
      throw new AIProviderError(this.slug, 502, `Kimi error: ${(err as Error).message}`);
    }
  }

  private buildUserContent(req: AIAnalysisRequest): unknown[] {
    const content: Array<{type: string; text?: string; source?: {type: string; media_type: string; data: string}}> = [];
    if (req.text) content.push({ type: 'text', text: req.text });
    if (req.imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: req.imageMimeType ?? 'image/jpeg',
          data: req.imageBase64,
        },
      });
    }
    if (content.length === 0) {
      throw new AIProviderError(this.slug, 400, 'No image or text provided');
    }
    return content;
  }

  private normalizeMealCategory(value: unknown): AIAnalysisResult['mealCategory'] {
    const valid = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    return (valid as readonly string[]).includes(String(value))
      ? (value as AIAnalysisResult['mealCategory'])
      : 'snack';
  }
}
