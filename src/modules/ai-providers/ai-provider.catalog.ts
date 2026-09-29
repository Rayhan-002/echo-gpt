import { AiProviderType } from '@prisma/client';

export interface ProviderCatalogEntry {
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

/**
 * Vendor defaults applied when an admin registers a provider without specifying
 * a base URL / model list. Everything here can be overridden per provider.
 */
export const AI_PROVIDER_CATALOG: Record<AiProviderType, ProviderCatalogEntry> = {
  [AiProviderType.OPENAI]: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-mini',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1-mini'],
  },
  [AiProviderType.ANTHROPIC]: {
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001'],
  },
  [AiProviderType.GEMINI]: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  },
};
