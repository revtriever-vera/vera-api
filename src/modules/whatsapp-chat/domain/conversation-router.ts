import type { InboundKind } from '../../whatsapp/services/inbound-dispatch.port';
import { isHelpRequest } from './help-request';
import { isPaymentRequest } from './pix-refusal';
import { ReminderCommand, parseReminderCommand } from './reminder-command';
import { typedConfirmationOf } from './typed-confirmation';
import { CHAT_ROUTES, GateState, Tap } from './whatsapp-chat.types';

export type RouterFacts = {
    readonly kind: InboundKind;
    readonly text: string;
    readonly pendingOpen: boolean;
    readonly remindersAvailable: boolean;
    readonly gate: GateState;
    readonly consentGranted: boolean;
};

export type ChatRoute =
    | { readonly name: typeof CHAT_ROUTES.button }
    | { readonly name: typeof CHAT_ROUTES.typedConfirmation; readonly tap: Tap }
    | { readonly name: typeof CHAT_ROUTES.reminderCommand; readonly command: ReminderCommand }
    | {
          readonly name:
              | typeof CHAT_ROUTES.unsupported
              | typeof CHAT_ROUTES.pixRefusal
              | typeof CHAT_ROUTES.help
              | typeof CHAT_ROUTES.premiumRequired
              | typeof CHAT_ROUTES.paused
              | typeof CHAT_ROUTES.disabled
              | typeof CHAT_ROUTES.noConsent
              | typeof CHAT_ROUTES.ask;
      };

const GATE_ROUTES: Readonly<Record<Exclude<GateState, 'available'>, ChatRoute>> = {
    premium_required: { name: CHAT_ROUTES.premiumRequired },
    paused: { name: CHAT_ROUTES.paused },
    disabled: { name: CHAT_ROUTES.disabled }
};

function fixedRouteOf(facts: RouterFacts): ChatRoute | null {
    if (facts.kind === 'button') {
        return { name: CHAT_ROUTES.button };
    }
    if (facts.kind === 'unsupported') {
        return { name: CHAT_ROUTES.unsupported };
    }
    const tap: Tap | null = facts.pendingOpen ? typedConfirmationOf(facts.text) : null;
    if (tap !== null) {
        return { name: CHAT_ROUTES.typedConfirmation, tap };
    }
    if (isPaymentRequest(facts.text)) {
        return { name: CHAT_ROUTES.pixRefusal };
    }
    return isHelpRequest(facts.text) ? { name: CHAT_ROUTES.help } : null;
}

function reminderRouteOf(facts: RouterFacts): ChatRoute | null {
    const command: ReminderCommand | null = facts.remindersAvailable ? parseReminderCommand(facts.text) : null;
    return command === null ? null : { name: CHAT_ROUTES.reminderCommand, command };
}

function gatedRouteOf(facts: RouterFacts): ChatRoute {
    if (facts.gate !== 'available') {
        return GATE_ROUTES[facts.gate];
    }
    return facts.consentGranted ? { name: CHAT_ROUTES.ask } : { name: CHAT_ROUTES.noConsent };
}

export function routeOf(facts: RouterFacts): ChatRoute {
    return fixedRouteOf(facts) ?? reminderRouteOf(facts) ?? gatedRouteOf(facts);
}

export function isFreeQuestion(text: string): boolean {
    const facts: RouterFacts = {
        kind: 'text',
        text,
        pendingOpen: false,
        remindersAvailable: true,
        gate: 'available',
        consentGranted: true
    };
    return routeOf(facts).name === CHAT_ROUTES.ask;
}
