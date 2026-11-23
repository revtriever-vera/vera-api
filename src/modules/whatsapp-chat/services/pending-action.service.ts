import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { pendingKindOfTool } from '../domain/channel-tools';
import { ChatTexts, chatTextsFor } from '../domain/fixed-replies';
import { PendingActionDomain } from '../domain/pending-action.domain';
import { PENDING_RESOLUTIONS, PendingAction, PendingKind, Tap } from '../domain/whatsapp-chat.types';
import { ChatExtensionsRegistry } from './chat-extensions.registry';
import { PendingActionExecutorPort } from './pending-action-executor.port';
import { WhatsAppChatLogService } from './whatsapp-chat-log.service';

export type Proposed = { readonly id: string; readonly summary: string };

export type ProposalInput = { readonly tool: string; readonly summary: string; readonly payload: JsonObject };

@Injectable()
export class PendingActionService {
    public constructor(
        private readonly actions: PendingActionDomain,
        private readonly registry: ChatExtensionsRegistry,
        private readonly logs: WhatsAppChatLogService
    ) {}

    public async hasOpen(linkId: string): Promise<boolean> {
        return (await this.actions.latestOpen(linkId, new Date())) !== null;
    }

    public async propose(linkId: string, proposal: ProposalInput, locale: AppLocale): Promise<Proposed | null> {
        const kind: PendingKind | null = pendingKindOfTool(proposal.tool);
        if (kind === null) {
            return null;
        }
        const action: PendingAction = await this.actions.propose(linkId, kind, proposal.payload, new Date());
        const executor: PendingActionExecutorPort | null = this.registry.executorFor(kind);
        return { id: action.id, summary: executor?.describe(proposal.payload, locale) ?? proposal.summary };
    }

    public async tap(linkId: string, id: string, tap: Tap, locale: AppLocale): Promise<string> {
        const target: PendingAction | null = await this.actions.ofLink(id, linkId);
        const latest: PendingAction | null = await this.actions.latestUnresolved(linkId);
        const texts: ChatTexts = chatTextsFor(locale);
        if (target === null || latest?.id !== target.id) {
            return texts.expiredConfirmation;
        }
        return this.resolveTap(linkId, target, tap, locale);
    }

    public async tapLatest(linkId: string, tap: Tap, locale: AppLocale): Promise<string> {
        const latest: PendingAction | null = await this.actions.latestOpen(linkId, new Date());
        return latest === null ? chatTextsFor(locale).expiredConfirmation : this.resolveTap(linkId, latest, tap, locale);
    }

    private async resolveTap(linkId: string, action: PendingAction, tap: Tap, locale: AppLocale): Promise<string> {
        const texts: ChatTexts = chatTextsFor(locale);
        const now: Date = new Date();
        const resolution: 'confirmed' | 'canceled' = tap === 'yes' ? PENDING_RESOLUTIONS.confirmed : PENDING_RESOLUTIONS.canceled;
        const resolved: PendingAction | null = await this.actions.resolve(action.id, resolution, now);
        if (resolved === null) {
            await this.actions.resolve(action.id, PENDING_RESOLUTIONS.expired, now);
            return texts.expiredConfirmation;
        }
        return tap === 'no' ? texts.canceled : this.execute(linkId, resolved, locale);
    }

    private async execute(linkId: string, action: PendingAction, locale: AppLocale): Promise<string> {
        const texts: ChatTexts = chatTextsFor(locale);
        const executor: PendingActionExecutorPort | null = this.registry.executorFor(action.kind as PendingKind);
        if (executor === null) {
            return texts.unavailable;
        }
        try {
            return (await executor.execute(action.payload as JsonObject)) ?? texts.done;
        } catch {
            this.logs.actionFailed(action.kind, linkId);
            return texts.unavailable;
        }
    }
}
