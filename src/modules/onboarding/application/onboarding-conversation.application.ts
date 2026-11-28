import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import {
    ScriptedConversation,
    ScriptedConversationService,
    ScriptedMessage,
    ScriptedMessageInput
} from '../../assistant-chat/services/scripted-conversation.service';
import { AccountModulesService } from '../../identity/services/account-modules.service';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { OnboardingStateDomain } from '../domain/onboarding-state.domain';
import { OnboardingState } from '../domain/onboarding.types';
import { ONBOARDING_SCRIPT } from '../domain/script/onboarding-steps';
import {
    SCRIPT_STATUSES,
    ScriptAction,
    ScriptEffect,
    ScriptMessage,
    ScriptModules,
    ScriptState,
    ScriptTurn
} from '../domain/script/script.types';
import { OnboardingLogService } from '../services/onboarding-log.service';
import { OnboardingConversationView, storedScriptStateSchema } from '../validation/onboarding-conversation.schemas';
import { conversationViewOf } from './onboarding-conversation.view';

interface ScriptSession {
    readonly record: OnboardingState;
    readonly conversationId: string;
    readonly script: ScriptState;
}

function inputOf(message: ScriptMessage): ScriptedMessageInput {
    return { role: message.role, text: message.text, payload: message.payload };
}

function firstNameOf(name: string): string | null {
    const first: string | undefined = name.trim().split(/\s+/)[0];
    return first === undefined || first === '' ? null : first;
}

function storedScriptOf(record: OnboardingState): ScriptState | null {
    if (record.script === null) {
        return null;
    }
    return storedScriptStateSchema.parse(record.script);
}

@Injectable()
export class OnboardingConversationApplication {
    public constructor(
        private readonly onboarding: OnboardingStateDomain,
        private readonly conversations: ScriptedConversationService,
        private readonly modules: AccountModulesService,
        private readonly currentUser: CurrentUserService,
        private readonly log: OnboardingLogService
    ) {}

    @UsingTransaction()
    public async open(): Promise<OnboardingConversationView> {
        return this.viewOf(await this.session());
    }

    @UsingTransaction()
    public async act(action: ScriptAction): Promise<OnboardingConversationView> {
        const session: ScriptSession = await this.session();
        const turn: ScriptTurn = ONBOARDING_SCRIPT.reduce(session.script, action);
        const saved: ScriptSession = await this.persist(session.record, session.conversationId, turn);
        this.log.scriptAction(action.type, session.script.status, saved.script.status);
        return this.viewOf(saved);
    }

    private async session(): Promise<ScriptSession> {
        const user: { readonly id: string; readonly name: string } = await this.currentUser.require();
        const record: OnboardingState = await this.onboarding.lockForScript();
        const conversation: ScriptedConversation = await this.conversations.openOnboarding(user.id, new Date());
        const stored: ScriptState | null = storedScriptOf(record);
        if (stored !== null) {
            return { record, conversationId: conversation.id, script: stored };
        }
        this.log.scriptStarted();
        return this.persist(record, conversation.id, ONBOARDING_SCRIPT.initial(firstNameOf(user.name)));
    }

    private async persist(record: OnboardingState, conversationId: string, turn: ScriptTurn): Promise<ScriptSession> {
        await this.conversations.append(conversationId, turn.messages.map(inputOf), new Date());
        for (const effect of turn.effects) {
            await this.apply(effect);
        }
        const finished: boolean = turn.state.status === SCRIPT_STATUSES.done;
        const saved: OnboardingState = await this.onboarding.saveScript(record, turn.state, finished);
        return { record: saved, conversationId, script: turn.state };
    }

    private async apply(effect: ScriptEffect): Promise<void> {
        await this.modules.change(effect.modules);
    }

    private async viewOf(session: ScriptSession): Promise<OnboardingConversationView> {
        const messages: ScriptedMessage[] = await this.conversations.history(session.conversationId);
        const modules: ScriptModules = await this.modules.current();
        return conversationViewOf({
            conversationId: session.conversationId,
            script: ONBOARDING_SCRIPT.view(session.script),
            modules,
            messages
        });
    }
}
