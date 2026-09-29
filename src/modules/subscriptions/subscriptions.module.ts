import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, QuotaService],
  exports: [SubscriptionsService, QuotaService],
})
export class SubscriptionsModule {}
