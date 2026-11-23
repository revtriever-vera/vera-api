import { WebhookBody, WebhookMessage, WebhookStatus } from '../validation/whatsapp-webhook.schemas';
import { InboundMessage, StatusUpdate } from './whatsapp.types';

const MILLISECONDS: number = 1000;
const FINAL_STATUSES: ReadonlySet<string> = new Set(['sent', 'delivered', 'read', 'failed']);

type MessageBase = Pick<InboundMessage, 'wamid' | 'from' | 'phoneNumberId' | 'timestamp' | 'contextWamid'>;

function baseOf(message: WebhookMessage, phoneNumberId: string): MessageBase {
    return {
        wamid: message.id,
        from: message.from,
        phoneNumberId,
        timestamp: new Date(Number(message.timestamp) * MILLISECONDS),
        contextWamid: message.context?.id
    };
}

function payloadOf(message: WebhookMessage): string | undefined {
    return message.button?.payload ?? message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
}

function messageOf(message: WebhookMessage, phoneNumberId: string): InboundMessage {
    const base: MessageBase = baseOf(message, phoneNumberId);
    if (message.type === 'text' && message.text !== undefined) {
        return { ...base, kind: 'text', text: message.text.body };
    }
    const payload: string | undefined = payloadOf(message);
    return payload === undefined ? { ...base, kind: 'unsupported' } : { ...base, kind: 'button', buttonPayload: payload };
}

function statusOf(status: WebhookStatus): StatusUpdate | null {
    if (!FINAL_STATUSES.has(status.status)) {
        return null;
    }
    const code: number | undefined = status.errors?.[0]?.code;
    return {
        wamid: status.id,
        status: status.status as StatusUpdate['status'],
        pricingCategory: status.pricing?.category ?? null,
        billable: status.pricing?.billable ?? null,
        errorCode: code === undefined ? null : String(code),
        timestamp: new Date(Number(status.timestamp) * MILLISECONDS)
    };
}

export function inboundMessagesOf(body: WebhookBody): InboundMessage[] {
    return body.entry.flatMap((entry) =>
        entry.changes.flatMap((change) =>
            (change.value.messages ?? []).map((message: WebhookMessage): InboundMessage =>
                messageOf(message, change.value.metadata.phone_number_id)
            )
        )
    );
}

export function statusUpdatesOf(body: WebhookBody): StatusUpdate[] {
    return body.entry
        .flatMap((entry) => entry.changes.flatMap((change) => change.value.statuses ?? []))
        .map(statusOf)
        .filter((update: StatusUpdate | null): update is StatusUpdate => update !== null);
}
