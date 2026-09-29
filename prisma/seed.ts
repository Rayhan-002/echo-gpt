import 'dotenv/config';
import { AiProviderType, PlanCode, PrismaClient, RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { encrypt } from '../src/common/utils/crypto.util';
import { AI_PROVIDER_CATALOG } from '../src/modules/ai-providers/ai-provider.catalog';

const prisma = new PrismaClient();

const ROLES = [
  { name: RoleName.ADMIN, description: 'Full access to administrative APIs' },
  { name: RoleName.USER, description: 'Regular end user' },
];

const PLANS = [
  {
    code: PlanCode.FREE,
    name: 'Free',
    description: 'Get started with EchoGPT at no cost.',
    priceCents: 0,
    dailyRequestLimit: 20,
    features: ['All enabled AI providers', '20 AI requests per day', 'Conversation history'],
  },
  {
    code: PlanCode.PREMIUM,
    name: 'Premium',
    description: 'For power users who chat and search all day.',
    priceCents: 999,
    dailyRequestLimit: 500,
    features: [
      'All enabled AI providers',
      '500 AI requests per day',
      'Conversation history',
      'AI summaries for web search',
      'Priority support',
    ],
  },
];

/** Optional provider bootstrap: set SEED_<TYPE>_API_KEY to register a provider on seed. */
const PROVIDER_KEYS: Record<AiProviderType, string | undefined> = {
  [AiProviderType.OPENAI]: process.env.SEED_OPENAI_API_KEY,
  [AiProviderType.ANTHROPIC]: process.env.SEED_ANTHROPIC_API_KEY,
  [AiProviderType.GEMINI]: process.env.SEED_GEMINI_API_KEY,
};

async function seedReferenceData(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { name: role.name }, update: role, create: role });
  }
  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: plan, create: plan });
  }
  console.log(`Seeded ${ROLES.length} roles and ${PLANS.length} plans`);
}

async function seedAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@echogpt.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping`);
    return;
  }

  const [adminRole, premium] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } }),
    prisma.plan.findUniqueOrThrow({ where: { code: PlanCode.PREMIUM } }),
  ]);

  await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      fullName: 'EchoGPT Admin',
      roleId: adminRole.id,
      emailVerifiedAt: new Date(),
      subscriptions: { create: { planId: premium.id } },
    },
  });
  console.log(`Created admin ${email}`);
}

async function seedProviders(): Promise<void> {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.log('ENCRYPTION_KEY not set, skipping provider seed');
    return;
  }

  let hasDefault = (await prisma.aiProvider.count({ where: { isDefault: true } })) > 0;

  for (const type of Object.values(AiProviderType)) {
    const apiKey = PROVIDER_KEYS[type];
    if (!apiKey) continue;

    const catalog = AI_PROVIDER_CATALOG[type];
    const exists = await prisma.aiProvider.findUnique({ where: { name: catalog.label } });
    if (exists) continue;

    await prisma.aiProvider.create({
      data: {
        name: catalog.label,
        type,
        apiKeyEncrypted: encrypt(apiKey, encryptionKey),
        apiKeyLast4: apiKey.slice(-4),
        defaultModel: catalog.defaultModel,
        models: catalog.models,
        isDefault: !hasDefault,
      },
    });
    hasDefault = true;
    console.log(`Registered provider ${catalog.label}`);
  }
}

async function main(): Promise<void> {
  await seedReferenceData();
  await seedAdmin();
  await seedProviders();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
