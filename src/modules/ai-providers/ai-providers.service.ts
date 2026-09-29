import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider, AiProviderType, Prisma, ProviderHealthStatus } from '@prisma/client';
import { EncryptionService } from '../../common/security/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_PROVIDER_CATALOG } from './ai-provider.catalog';
import { AiAdapterRegistry } from './adapters/ai-adapter.registry';
import { AiProviderAdapter, ProviderConnection } from './adapters/ai-provider-adapter.interface';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';

/** Everything needed to call a provider for one request. */
export interface ResolvedProvider {
  provider: AiProvider;
  model: string;
  adapter: AiProviderAdapter;
  connection: ProviderConnection;
}

@Injectable()
export class AiProvidersService {
  private readonly logger = new Logger(AiProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly adapters: AiAdapterRegistry,
  ) {}

  findAll(): Promise<AiProvider[]> {
    return this.prisma.aiProvider.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  findEnabled(): Promise<AiProvider[]> {
    return this.prisma.aiProvider.findMany({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findById(id: string): Promise<AiProvider> {
    const provider = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('AI provider not found');
    }
    return provider;
  }

  async create(dto: CreateProviderDto): Promise<AiProvider> {
    const isEnabled = dto.isEnabled ?? true;
    const isDefault = dto.isDefault ?? false;
    if (isDefault && !isEnabled) {
      throw new BadRequestException('A disabled provider cannot be the default');
    }

    const { models, defaultModel } = this.resolveModels(dto.type, dto.models, dto.defaultModel);
    return this.withUniqueName(dto.name, () =>
      this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.aiProvider.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.aiProvider.create({
          data: {
            name: dto.name,
            type: dto.type,
            baseUrl: dto.baseUrl,
            models,
            defaultModel,
            isEnabled,
            isDefault,
            ...this.encryptKey(dto.apiKey),
          },
        });
      }),
    );
  }

  async update(id: string, dto: UpdateProviderDto): Promise<AiProvider> {
    const existing = await this.findById(id);
    const nextModels = dto.models ?? existing.models;
    const { models, defaultModel } = this.resolveModels(
      existing.type,
      nextModels,
      // Keep the current default model while it remains available.
      dto.defaultModel ??
        (nextModels.includes(existing.defaultModel) ? existing.defaultModel : undefined),
    );

    const keyChanged = dto.apiKey !== undefined;
    const endpointChanged = keyChanged || dto.baseUrl !== undefined;

    return this.withUniqueName(dto.name ?? existing.name, () =>
      this.prisma.aiProvider.update({
        where: { id },
        data: {
          name: dto.name,
          baseUrl: dto.baseUrl,
          models,
          defaultModel,
          ...(keyChanged ? this.encryptKey(dto.apiKey as string) : {}),
          // Old health results say nothing about a new key/endpoint.
          ...(endpointChanged ? { healthStatus: ProviderHealthStatus.UNKNOWN } : {}),
        },
      }),
    );
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.aiProvider.delete({ where: { id } });
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<AiProvider> {
    await this.findById(id);
    return this.prisma.aiProvider.update({
      where: { id },
      // Disabling the default provider also clears its default flag.
      data: isEnabled ? { isEnabled } : { isEnabled, isDefault: false },
    });
  }

  async setDefault(id: string): Promise<AiProvider> {
    const provider = await this.findById(id);
    if (!provider.isEnabled) {
      throw new ConflictException('Enable the provider before making it the default');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.aiProvider.update({ where: { id }, data: { isDefault: true } });
    });
  }

  /** Calls the vendor with the stored credentials and records the outcome. */
  async checkHealth(id: string): Promise<AiProvider> {
    const provider = await this.findById(id);
    const startedAt = Date.now();
    let error: string | null = null;

    try {
      await this.adapters.get(provider.type).healthCheck(this.connectionFor(provider));
    } catch (e) {
      error = (e as Error).message.slice(0, 1000);
      this.logger.warn(`Health check failed for provider ${provider.name}: ${error}`);
    }

    return this.prisma.aiProvider.update({
      where: { id },
      data: {
        healthStatus: error ? ProviderHealthStatus.UNHEALTHY : ProviderHealthStatus.HEALTHY,
        lastHealthCheckAt: new Date(),
        lastHealthLatencyMs: Date.now() - startedAt,
        lastHealthError: error,
      },
    });
  }

  async checkAllHealth(): Promise<AiProvider[]> {
    const providers = await this.findEnabled();
    return Promise.all(providers.map((provider) => this.checkHealth(provider.id)));
  }

  /**
   * Picks the provider and model for a request: the requested provider (must be
   * enabled) or the default one, and the requested model (must be allowed) or
   * the provider's default model.
   */
  async resolve(providerId?: string | null, model?: string | null): Promise<ResolvedProvider> {
    const provider = providerId
      ? await this.prisma.aiProvider.findUnique({ where: { id: providerId } })
      : await this.findDefault();

    if (providerId && !provider) {
      throw new NotFoundException('AI provider not found');
    }
    if (!provider) {
      throw new ServiceUnavailableException('No AI provider is configured');
    }
    if (!provider.isEnabled) {
      throw new ConflictException(`AI provider "${provider.name}" is currently disabled`);
    }

    const selectedModel = model ?? provider.defaultModel;
    if (!provider.models.includes(selectedModel)) {
      throw new BadRequestException(
        `Model "${selectedModel}" is not available for ${provider.name}. Available: ${provider.models.join(', ')}`,
      );
    }

    return {
      provider,
      model: selectedModel,
      adapter: this.adapters.get(provider.type),
      connection: this.connectionFor(provider),
    };
  }

  private async findDefault(): Promise<AiProvider | null> {
    // Fall back to any enabled provider when no default has been chosen.
    return this.prisma.aiProvider.findFirst({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private connectionFor(provider: AiProvider): ProviderConnection {
    return {
      apiKey: this.encryption.decrypt(provider.apiKeyEncrypted),
      baseUrl: provider.baseUrl ?? AI_PROVIDER_CATALOG[provider.type].baseUrl,
    };
  }

  private encryptKey(apiKey: string) {
    return { apiKeyEncrypted: this.encryption.encrypt(apiKey), apiKeyLast4: apiKey.slice(-4) };
  }

  private resolveModels(type: AiProviderType, models?: string[], defaultModel?: string) {
    const catalog = AI_PROVIDER_CATALOG[type];
    const list = [...new Set(models?.length ? models : catalog.models)];
    const selectedDefault =
      defaultModel ?? (list.includes(catalog.defaultModel) ? catalog.defaultModel : list[0]);

    if (!list.includes(selectedDefault)) {
      throw new BadRequestException(`defaultModel "${selectedDefault}" must be one of models`);
    }
    return { models: list, defaultModel: selectedDefault };
  }

  private async withUniqueName<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A provider named "${name}" already exists`);
      }
      throw error;
    }
  }
}
