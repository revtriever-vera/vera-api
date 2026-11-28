import { Injectable } from '@nestjs/common';
import { AssistantConversationsRepository } from '../repositories/assistant-conversations.repository';
import { AssistantConversation } from './assistant-chat.types';

@Injectable()
export class AssistantConversationDomain {
    public constructor(private readonly conversations: AssistantConversationsRepository) {}

    public async open(userId: string, at: Date): Promise<AssistantConversation> {
        return this.conversations.open(userId, at);
    }

    public async openOnboarding(userId: string, at: Date): Promise<AssistantConversation> {
        return this.conversations.openOnboarding(userId, at);
    }

    public async findOnboarding(): Promise<AssistantConversation | null> {
        return this.conversations.findOnboarding();
    }

    public async findOfUser(id: string, userId: string): Promise<AssistantConversation | null> {
        return this.conversations.findOfUser(id, userId);
    }

    public async latestOfUser(userId: string): Promise<AssistantConversation | null> {
        return this.conversations.latestOfUser(userId);
    }

    public async touch(id: string, at: Date): Promise<void> {
        await this.conversations.touch(id, at);
    }

    public async listOfUser(userId: string): Promise<AssistantConversation[]> {
        return this.conversations.listOfUser(userId);
    }

    public async erase(id: string): Promise<void> {
        await this.conversations.eraseById(id);
    }

    public async eraseOfUser(userId: string): Promise<number> {
        return this.conversations.eraseOfUser(userId);
    }

    public async eraseAll(): Promise<number> {
        return this.conversations.eraseAll();
    }

    public async purgeIdleBefore(cutoff: Date): Promise<number> {
        return this.conversations.purgeIdleBefore(cutoff);
    }
}
