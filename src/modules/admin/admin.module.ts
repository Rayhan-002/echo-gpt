import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { SearchModule } from '../search/search.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminLogsController } from './controllers/admin-logs.controller';
import { AdminSubscriptionsController } from './controllers/admin-subscriptions.controller';
import { AdminSystemController } from './controllers/admin-system.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminSubscriptionsService } from './services/admin-subscriptions.service';
import { AdminUsersService } from './services/admin-users.service';
import { SystemService } from './services/system.service';

/**
 * Admin panel APIs. AI provider management lives with its domain in
 * AiProvidersModule (under /admin/providers).
 */
@Module({
  imports: [UsersModule, SessionsModule, SubscriptionsModule, AiProvidersModule, SearchModule],
  controllers: [
    AdminDashboardController,
    AdminAnalyticsController,
    AdminLogsController,
    AdminUsersController,
    AdminSubscriptionsController,
    AdminSystemController,
  ],
  providers: [AdminAnalyticsService, AdminUsersService, AdminSubscriptionsService, SystemService],
})
export class AdminModule {}
