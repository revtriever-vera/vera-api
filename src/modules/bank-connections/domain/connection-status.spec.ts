import { describe, expect, it } from 'vitest';
import { PluggyItem } from '../ports/pluggy-client.port';
import { draftOfItem, PAUSED, REVOKED, statusOfItem } from './connection-status';

const ITEM: PluggyItem = {
    id: 'item-1',
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    connectorName: 'Nubank',
    lastUpdatedAt: new Date('2026-10-01T10:00:00.000Z'),
    consentExpiresAt: new Date('2027-01-01T00:00:00.000Z')
};

describe('statusOfItem', () => {
    it.each([
        ['UPDATED', 'active', null],
        ['UPDATING', 'active', null],
        ['LOGIN_ERROR', 'needs_attention', 'login_error'],
        ['OUTDATED', 'needs_attention', 'outdated'],
        ['WAITING_USER_INPUT', 'needs_attention', 'waiting_user_input'],
        ['SOMETHING_NEW', 'active', null],
        ['constructor', 'active', null]
    ])('mapeia o status %s da Pluggy para %s', (itemStatus, status, statusReason) => {
        expect(statusOfItem(itemStatus)).toEqual({ status, statusReason });
    });

    it('expõe os estados que não vêm do item', () => {
        expect(REVOKED).toEqual({ status: 'revoked', statusReason: 'item_not_found' });
        expect(PAUSED).toEqual({ status: 'paused', statusReason: 'credentials_invalid' });
    });
});

describe('draftOfItem', () => {
    it('guarda o status do item, o conector e o fim do consentimento', () => {
        expect(draftOfItem({ ...ITEM, status: 'LOGIN_ERROR' })).toEqual({
            externalItemId: 'item-1',
            connectorName: 'Nubank',
            status: 'needs_attention',
            statusReason: 'login_error',
            providerStatus: 'LOGIN_ERROR',
            consentExpiresAt: new Date('2027-01-01T00:00:00.000Z')
        });
    });
});
