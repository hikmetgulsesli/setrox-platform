// Common interface for all AI providers. Each provider (Gemini, Kimi, MiniMax, ...)
// implements this so the rest of the system doesn't care which one is in use.

import type { FoodItem, MealCategory, HealthGoal } from '@setrox/shared';

export interface AIAnalysisRequest {
  /** base64-encoded image data (no data: prefix) */
  imageBase64?: string;
  imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Turkish (or any language) description of the meal for text-based analysis */
  text?: string;
  mealCategory?: MealCategory;
  healthGoal?: HealthGoal;
}

export interface AIAnalysisResult {
  items: FoodItem[];
  mealCategory: MealCategory;
  smartInsight?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model?: string;
}

export interface AIProviderAdapter {
  /** Provider slug identifier, matches AIProvider.slug in DB */
  readonly slug: string;

  /** Validate the API key is usable */
  testConnection(): Promise<boolean>;

  /** Run a food analysis (image or text) */
  analyze(req: AIAnalysisRequest): Promise<AIAnalysisResult>;
}

export class AIProviderError extends Error {
  constructor(
    public readonly providerSlug: string,
    public readonly statusCode: number | undefined,
    message: string,
    public readonly isFatal: boolean = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
