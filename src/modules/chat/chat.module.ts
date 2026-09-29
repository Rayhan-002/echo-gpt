import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AiProvidersModule, SubscriptionsModule],
  controllers: [ChatController],
  providers: [ChatService, ConversationsService],
})
export class ChatModule {}
