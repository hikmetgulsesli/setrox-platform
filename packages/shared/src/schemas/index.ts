import { z } from 'zod';

export const MealCategorySchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const HealthGoalSchema = z.enum(['hypertension', 'diabetes', 'gut_health', 'weight_management']).nullable();
export const UnitSystemSchema = z.enum(['metric', 'imperial']);

export const FoodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
  estimatedPortionGrams: z.number().positive(),
  caloriesPer100g: z.number().min(0),
  proteinPer100g: z.number().min(0),
  carbsPer100g: z.number().min(0),
  fatPer100g: z.number().min(0),
  fiberPer100g: z.number().min(0).optional(),
  sugarPer100g: z.number().min(0).optional(),
  sodiumPer100g: z.number().min(0).optional(),
  isVerified: z.boolean().optional(),
});

export const LogEntrySchema = z.object({
  id: z.string(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealCategory: MealCategorySchema,
  items: z.array(FoodItemSchema),
  smartInsight: z.string().optional(),
  imageUris: z.array(z.string()).optional(),
  totalCalories: z.number(),
  totalProtein: z.number(),
  totalCarbs: z.number(),
  totalFat: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AnalysisResultSchema = z.object({
  id: z.string().optional(),
  imageUri: z.string().optional(),
  imageUris: z.array(z.string()).optional(),
  items: z.array(FoodItemSchema),
  mealCategory: MealCategorySchema,
  smartInsight: z.string().optional(),
});

// ===== API request schemas =====

export const AIAnalyzeImageRequestSchema = z.object({
  imageBase64: z.string().min(100), // base64 encoded image
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  mealCategory: MealCategorySchema.optional(),
  healthGoal: HealthGoalSchema.optional(),
});

export const AIAnalyzeTextRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  mealCategory: MealCategorySchema.optional(),
  healthGoal: HealthGoalSchema.optional(),
});

export const AIFeedbackRequestSchema = z.object({
  requestId: z.string(),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(1000).optional(),
});

export const LogSyncRequestSchema = z.object({
  entries: z.array(LogEntrySchema.extend({ deleted: z.boolean().optional() })),
  lastSyncedAt: z.string().optional(),
});

export const HydrationSyncRequestSchema = z.object({
  days: z.array(z.object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountMl: z.number().min(0).max(10000),
  })),
});

export const ProfileUpdateRequestSchema = z.object({
  displayName: z.string().max(100).optional(),
  goals: z.object({
    dailyCalorieGoal: z.number().nullable().optional(),
    dailyProteinGoal: z.number().nullable().optional(),
    dailyCarbGoal: z.number().nullable().optional(),
    dailyFatGoal: z.number().nullable().optional(),
    showMicronutrients: z.boolean().optional(),
    showSodium: z.boolean().optional(),
    showFiber: z.boolean().optional(),
    showSugar: z.boolean().optional(),
  }).optional(),
  healthGoal: HealthGoalSchema.optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  height: z.number().min(50).max(250).nullable().optional(),
  weight: z.number().min(20).max(300).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  unitSystem: UnitSystemSchema.optional(),
});

// ===== Subscription schemas =====

export const PlanTierSchema = z.enum(['free', 'pro', 'pro_plus']);

export const VerifyReceiptRequestSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  productId: z.string().min(1),
  receipt: z.string().min(10),  // base64 receipt for iOS, purchase token for Android
  environment: z.enum(['sandbox', 'production']).default('production'),
});

export const StartTrialRequestSchema = z.object({
  productId: z.string().min(1),  // trial product id
});

export const CancelSubscriptionRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ===== Auth schemas =====

export const AuthRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
});

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const AuthRefreshRequestSchema = z.object({
  refreshToken: z.string(),
});
