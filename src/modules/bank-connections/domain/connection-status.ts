import { PluggyItem } from '../ports/pluggy-client.port';
import { CONNECTION_STATUSES, ConnectionDraft, ConnectionStatus, STATUS_REASONS, StatusReason } from './bank-connections.types';

export interface DerivedStatus {
    readonly status: ConnectionStatus;
    readonly statusReason: StatusReason | null;
}

const ACTIVE: DerivedStatus = { status: CONNECTION_STATUSES.active, statusReason: null };

const ATTENTION_BY_ITEM_STATUS: ReadonlyMap<string, DerivedStatus> = new Map<string, DerivedStatus>([
    ['LOGIN_ERROR', { status: CONNECTION_STATUSES.needsAttention, statusReason: STATUS_REASONS.loginError }],
    ['OUTDATED', { status: CONNECTION_STATUSES.needsAttention, statusReason: STATUS_REASONS.outdated }],
    ['WAITING_USER_INPUT', { status: CONNECTION_STATUSES.needsAttention, statusReason: STATUS_REASONS.waitingUserInput }]
]);

export const REVOKED: DerivedStatus = { status: CONNECTION_STATUSES.revoked, statusReason: STATUS_REASONS.itemNotFound };
export const PAUSED: DerivedStatus = { status: CONNECTION_STATUSES.paused, statusReason: STATUS_REASONS.credentialsInvalid };

export function statusOfItem(itemStatus: string): DerivedStatus {
    return ATTENTION_BY_ITEM_STATUS.get(itemStatus) ?? ACTIVE;
}

export function draftOfItem(item: PluggyItem): ConnectionDraft {
    const derived: DerivedStatus = statusOfItem(item.status);
    return {
        externalItemId: item.id,
        connectorName: item.connectorName,
        status: derived.status,
        statusReason: derived.statusReason,
        providerStatus: item.status,
        consentExpiresAt: item.consentExpiresAt
    };
}
