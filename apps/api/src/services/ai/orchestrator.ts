/**
 * Provider orchestrator: picks enabled providers, handles fallback, logs usage.
 * This is the single entry point for AI requests in the API.
 */

import type { AIProviderAdapter, AIAnalysisRequest, AIAnalysisResult } from './types';
import { AIProviderError } from './types';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { decrypt } from '../../utils/encryption';
import { GeminiAdapter } from './gemini.adapter';
import { KimiAdapter } from './kimi.adapter';
import { MiniMaxAdapter } from './minimax.adapter';

interface OrchestratorOptions {
  applicationId: string;
  appUserId?: string;
  requestType: 'image' | 'text';
}

interface ProviderInstance {
  adapter: AIProviderAdapter;
  configId: string;
  priority: number;
  providerId: string;
  providerSlug: string;
  providerName: string;
  costPer1kInput: number;
  costPer1kOutput: number;
}

export class AIOrchestrator {
  private providers: ProviderInstance[] = [];

  /**
   * Loads enabled providers for the given app, ordered by priority.
   * Decrypts API keys on demand.
   */
  async loadProviders(applicationId: string): Promise<void> {
    const configs = await prisma.appProviderConfig.findMany({
      where: {
        applicationId,
        isEnabled: true,
        provider: { isEnabled: true },
      },
      include: { provider: true },
      orderBy: [{ priority: 'asc' }, { provider: { priority: 'asc' } }],
    });

    this.providers = configs.flatMap((cfg) => {
      try {
        const apiKey = decrypt(cfg.provider.apiKeyCipher);
        const adapter = this.createAdapter(cfg.provider.slug, apiKey, cfg.provider.config as Record<string, unknown> | null);
        if (!adapter) return [];
        return [{
          adapter,
          configId: cfg.id,
          priority: cfg.priority,
          providerId: cfg.provider.id,
          providerSlug: cfg.provider.slug,
          providerName: cfg.provider.displayName,
          costPer1kInput: Number(cfg.provider.costPer1kInput),
          costPer1kOutput: Number(cfg.provider.costPer1kOutput),
        }];
      } catch (err) {
        logger.error('Failed to init provider', {
          slug: cfg.provider.slug,
          err: (err as Error).message,
        });
        return [];
      }
    });

    if (this.providers.length === 0) {
      throw new AIProviderError('orchestrator', 503, 'No enabled providers for this app', true);
    }
  }

  async analyze(
    req: AIAnalysisRequest,
    opts: OrchestratorOptions,
  ): Promise<AIAnalysisResult & { providerSlug: string }> {
    if (this.providers.length === 0) {
      await this.loadProviders(opts.applicationId);
    }

    const errors: Array<{ slug: string; message: string }> = [];

    for (const p of this.providers) {
      const start = Date.now();
      try {
        const result = await p.adapter.analyze(req);
        const cost = this.computeCost(p, result.inputTokens, result.outputTokens);

        // Log successful usage
        await prisma.aIUsageLog.create({
          data: {
            applicationId: opts.applicationId,
            providerId: p.providerId,
            appUserId: opts.appUserId,
            type: opts.requestType,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: cost,
            latencyMs: result.latencyMs,
            success: true,
          },
        });

        logger.info('AI analyze success', {
          provider: p.providerSlug,
          latencyMs: result.latencyMs,
          items: result.items.length,
          cost: cost.toFixed(6),
        });

        return { ...result, providerSlug: p.providerSlug };
      } catch (err) {
        const e = err as AIProviderError;
        const latencyMs = Date.now() - start;
        errors.push({ slug: p.providerSlug, message: e.message });

        await prisma.aIUsageLog.create({
          data: {
            applicationId: opts.applicationId,
            providerId: p.providerId,
            appUserId: opts.appUserId,
            type: opts.requestType,
            latencyMs,
            success: false,
            errorCode: String(e.statusCode ?? 'UNKNOWN'),
            errorMessage: e.message,
          },
        });

        logger.warn('AI provider failed, trying next', {
          provider: p.providerSlug,
          err: e.message,
        });
        // Continue to next provider
      }
    }

    // All providers failed
    const detail = errors.map((e) => `${e.slug}: ${e.message}`).join('; ');
    throw new AIProviderError('orchestrator', 503, `All providers failed: ${detail}`, true);
  }

  private createAdapter(
    slug: string,
    apiKey: string,
    config: Record<string, unknown> | null,
  ): AIProviderAdapter | null {
    const model = (config?.model as string) ?? undefined;
    const baseUrl = (config?.baseUrl as string) ?? undefined;

    switch (slug) {
      case 'gemini-flash':
      case 'gemini-pro':
        return new GeminiAdapter(apiKey, model);
      case 'kimi':
        return new KimiAdapter(apiKey, baseUrl, model);
      case 'minimax':
        return new MiniMaxAdapter(apiKey, baseUrl, model);
      default:
        logger.warn('Unknown provider slug', { slug });
        return null;
    }
  }

  private computeCost(p: ProviderInstance, inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1000) * p.costPer1kInput + (outputTokens / 1000) * p.costPer1kOutput;
  }
}
