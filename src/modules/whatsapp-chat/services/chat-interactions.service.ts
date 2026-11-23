import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../shared/i18n/locale';
import type { InboundMessage } from '../../whatsapp/services/inbound-dispatch.port';
import { BUTTON_PREFIXES, ButtonId, parseButtonId } from '../domain/button-id';
import { chatTextsFor } from '../domain/fixed-replies';
import { ReminderCommand } from '../domain/reminder-command';
import { Tap } from '../domain/whatsapp-chat.types';
import { ChatExtensionsRegistry } from './chat-extensions.registry';
import { PendingActionService } from './pending-action.service';
import { ReminderButtonAction, ReminderCommandsPort } from './reminder-commands.port';

const REMINDER_ACTIONS: ReadonlySet<string> = new Set<ReminderButtonAction>(['done', 'snooze1h', 'tomorrow']);

@Injectable()
export class ChatInteractionsService {
    public constructor(
        private readonly pending: PendingActionService,
        private readonly registry: ChatExtensionsRegistry
    ) {}

    public async button(linkId: string, message: InboundMessage, locale: AppLocale): Promise<string | null> {
        const button: ButtonId | null = parseButtonId(message.buttonPayload);
        if (button?.prefix === BUTTON_PREFIXES.action && (button.action === 'yes' || button.action === 'no')) {
            return this.pending.tap(linkId, button.id, button.action, locale);
        }
        if (button?.prefix === BUTTON_PREFIXES.reminder && REMINDER_ACTIONS.has(button.action)) {
            return this.reminderButton(button, locale);
        }
        return null;
    }

    public async typed(linkId: string, tap: Tap, locale: AppLocale): Promise<string> {
        return this.pending.tapLatest(linkId, tap, locale);
    }

    public async reminder(command: ReminderCommand, locale: AppLocale): Promise<string> {
        const reminders: ReminderCommandsPort | null = this.registry.reminders();
        if (reminders === null) {
            return chatTextsFor(locale).remindersUnavailable;
        }
        return command.kind === 'list' ? reminders.list(locale) : reminders.remove(command.index, locale);
    }

    private async reminderButton(button: ButtonId, locale: AppLocale): Promise<string> {
        const reminders: ReminderCommandsPort | null = this.registry.reminders();
        return reminders === null
            ? chatTextsFor(locale).remindersUnavailable
            : reminders.apply(button.action as ReminderButtonAction, button.id, locale);
    }
}
