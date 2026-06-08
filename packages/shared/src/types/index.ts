// Shared domain types used across API, Admin, and clients (iOS).

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type HealthGoal =
  | 'hypertension'
  | 'diabetes'
  | 'gut_health'
  | 'weight_management'
  | null;

export type UnitSystem = 'metric' | 'imperial';

export type AuthProvider = 'email' | 'google' | 'apple';

// ===== Plan / Subscription =====

export type PlanTier = 'free' | 'pro' | 'pro_plus';

export type SubscriptionPlatform = 'ios' | 'android' | 'web';

export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'trial'
  | 'paused';

export interface PlanInfo {
  tier: PlanTier;
  displayName: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  features: string[];
  // Daily AI scan quota. -1 = unlimited
  dailyAiQuota: number;
  // What the plan unlocks
  perks: {
    unlimitedAi: boolean;
    multiAiEnsemble: boolean;
    clinicalAlarms: boolean;
    cloudSync: boolean;
    pdfReports: boolean;
    dietitianMode: boolean;
    prioritySupport: boolean;
    pushNotifications: boolean;
    unlimitedHistory: boolean;
    advancedTrends: boolean;
  };
  isPopular?: boolean;
}

export interface SubscriptionInfo {
  id: string;
  platform: SubscriptionPlatform;
  productId: string;
  status: SubscriptionStatus;
  startsAt: string;
  expiresAt: string;
  autoRenew: boolean;
  trialEndsAt?: string;
  planTier: PlanTier;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  goals: NutritionGoals;
  unitSystem: UnitSystem;
  isFirstLaunch: boolean;
  /** @deprecated use `plan` instead */
  isPremium: boolean;
  /** Current plan tier */
  plan: PlanTier;
  /** Whether user is in active trial */
  isInTrial: boolean;
  trialEndsAt: string | null;
  freeScansUsed: number;
  healthGoal: HealthGoal;
  age?: number;
  height?: number;
  weight?: number;
  gender?: 'male' | 'female' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface FoodItem {
  id: string;
  name: string;
  confidence: number;
  estimatedPortionGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number;
  sugarPer100g?: number;
  sodiumPer100g?: number;
  isVerified?: boolean;
}

export interface NutritionGoals {
  dailyCalorieGoal: number | null;
  dailyProteinGoal: number | null;
  dailyCarbGoal: number | null;
  dailyFatGoal: number | null;
  showMicronutrients: boolean;
  showSodium: boolean;
  showFiber: boolean;
  showSugar: boolean;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  goals: NutritionGoals;
  unitSystem: UnitSystem;
  isFirstLaunch: boolean;
  isPremium: boolean;
  freeScansUsed: number;
  healthGoal: HealthGoal;
  age?: number;
  height?: number;
  weight?: number;
  gender?: 'male' | 'female' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  dateKey: string; // YYYY-MM-DD
  mealCategory: MealCategory;
  items: FoodItem[];
  smartInsight?: string;
  imageUris?: string[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisResult {
  id?: string;
  imageUri?: string;
  imageUris?: string[];
  items: FoodItem[];
  mealCategory: MealCategory;
  smartInsight?: string;
}

export interface AIProviderInfo {
  id: string;
  slug: string;
  displayName: string;
  type: 'vision' | 'text' | 'both';
  isEnabled: boolean;
  priority: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  notes?: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationInfo {
  id: string;
  slug: string;
  name: string;
  description?: string;
  isActive: boolean;
  freeQuotaPerDay: number;
  totalUsers: number;
  totalRequests: number;
  createdAt: string;
}

export interface UsageStats {
  totalRequests: number;
  totalCost: number;
  successRate: number;
  averageLatencyMs: number;
  byProvider: Array<{
    providerSlug: string;
    providerName: string;
    requests: number;
    cost: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
    cost: number;
  }>;
}
