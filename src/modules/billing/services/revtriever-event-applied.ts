import { RevtrieverEvent } from '../domain/billing.types';
import { EventData, eventDataSchema } from '../validation/revtriever-events.schemas';

export interface AppliedEvent {
    readonly type: string;
    readonly eventId: string;
    readonly data: EventData;
    readonly occurredAt: Date;
}

interface StoredPayload {
    readonly data?: unknown;
    readonly occurredAt?: string;
    readonly createdAt?: string;
}

export function dateOf(value: string | null | undefined): Date | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed: Date = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function appliedEventOf(row: RevtrieverEvent): AppliedEvent | null {
    const payload: StoredPayload = row.payload as StoredPayload;
    const data: EventData | undefined = eventDataSchema.safeParse(payload.data ?? {}).data;
    if (data === undefined) {
        return null;
    }
    return {
        type: row.type,
        eventId: row.externalEventId,
        data,
        occurredAt: dateOf(payload.occurredAt ?? payload.createdAt) ?? row.receivedAt
    };
}

export function customerRefOf(data: EventData): string | null {
    return data.customerExternalRef ?? data.customer?.externalRef ?? null;
}
