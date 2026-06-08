// Seed script: creates initial admin user, default AI providers, and the HealthLens app.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encrypt } from './utils/encryption.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Admin user
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@setrox.com.tr';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'change-me-on-first-login';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Platform Admin',
      role: 'superadmin',
    },
  });
  console.log(`✅ Admin user: ${admin.email}`);

  // 2. Default AI providers
  const defaultProviders = [
    {
      slug: 'gemini-flash',
      displayName: 'Gemini 2.0 Flash',
      type: 'both' as const,
      priority: 10,
      costPer1kInput: 0.000075,
      costPer1kOutput: 0.0003,
      config: { model: 'gemini-2.0-flash' },
      notes: 'Fast & cheap. Default for free tier.',
    },
    {
      slug: 'gemini-pro',
      displayName: 'Gemini 2.5 Pro',
      type: 'both' as const,
      priority: 20,
      costPer1kInput: 0.00125,
      costPer1kOutput: 0.005,
      config: { model: 'gemini-2.5-pro' },
      notes: 'Higher quality. Recommended for premium tier.',
    },
    {
      slug: 'kimi',
      displayName: 'Kimi K2',
      type: 'both' as const,
      priority: 30,
      costPer1kInput: 0.001,
      costPer1kOutput: 0.003,
      config: { model: 'kimi-k2', baseUrl: 'https://api.kimi.com/coding/v1' },
      notes: 'Moonshot AI. Multimodal, strong reasoning.',
    },
    {
      slug: 'minimax',
      displayName: 'MiniMax M2',
      type: 'both' as const,
      priority: 40,
      costPer1kInput: 0.0005,
      costPer1kOutput: 0.002,
      config: { model: 'MiniMax-M2', baseUrl: 'https://api.minimax.io/v1' },
      notes: 'OpenAI-compatible API. Fast.',
    },
  ];

  for (const p of defaultProviders) {
    // Use empty string as initial API key cipher (admin must set real keys)
    const placeholderKey = encrypt('REPLACE_ME_' + p.slug);
    const provider = await prisma.aIProvider.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        ...p,
        apiKeyCipher: placeholderKey,
        isEnabled: false, // Disabled until API key is set
      },
    });
    console.log(`✅ Provider: ${provider.displayName} (${provider.slug})`);
  }

  // 3. HealthLens application
  const apiKey = process.env.HEALTHLENS_API_KEY ?? `app_${Date.now()}${Math.random().toString(36).slice(2)}`;
  const app = await prisma.application.upsert({
    where: { slug: 'healthlens' },
    update: {
      // Update pricing/quota to current scheme if app already exists
      freeQuotaPerDay: 3,
      proQuotaPerDay: 100,
      priceMonthlyCents: 499,    // $4.99
      priceYearlyCents: 5999,    // $59.99 (≈17% off per-month)
      priceProPlusMonthlyCents: 999,  // $9.99
      priceProPlusYearlyCents: 11999, // $119.99
      trialDays: 7,
    },
    create: {
      slug: 'healthlens',
      name: 'HealthLens',
      description: 'AI-powered clinical nutrition assistant',
      apiKey,
      freeQuotaPerDay: 3,        // tightened from 5 → 3 for better conversion
      proQuotaPerDay: 100,
      priceMonthlyCents: 499,    // $4.99
      priceYearlyCents: 5999,    // $59.99
      priceProPlusMonthlyCents: 999,
      priceProPlusYearlyCents: 11999,
      trialDays: 7,
    },
  });
  console.log(`✅ Application: ${app.name} (slug: ${app.slug})`);
  console.log(`   API Key: ${apiKey}`);
  console.log(`   Plans: Free 3/day · Pro $4.99/mo · Pro+ $9.99/mo · 7-day trial`);

  // 4. Enable all providers for HealthLens by default (admin can configure)
  const allProviders = await prisma.aIProvider.findMany();
  for (const provider of allProviders) {
    await prisma.appProviderConfig.upsert({
      where: { applicationId_providerId: { applicationId: app.id, providerId: provider.id } },
      update: {},
      create: {
        applicationId: app.id,
        providerId: provider.id,
        isEnabled: true, // Will fall back if no API key set
        priority: provider.priority,
      },
    });
  }
  console.log('✅ Default app-provider configs created');

  console.log('\n🎉 Seed complete!');
  console.log('\n⚠️  IMPORTANT:');
  console.log(`   1. Login to admin: ${adminEmail} / ${adminPassword}`);
  console.log('   2. Set real API keys for providers via admin panel');
  console.log('   3. HealthLens API key (for iOS app):');
  console.log(`      ${apiKey}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
