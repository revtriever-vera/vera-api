import { describe, expect, it } from 'vitest';
import { TransactionFingerprintService } from './transaction-fingerprint.service';

describe('TransactionFingerprintService', () => {
    const service: TransactionFingerprintService = new TransactionFingerprintService();
    const base = { accountId: 'acc', date: '2026-09-10', amountMinor: -5000, normalizedDescription: 'CAFE' };

    it('gera 32 caracteres hexadecimais', () => {
        expect(service.of({ ...base, occurrence: 1 })).toMatch(/^[0-9a-f]{32}$/);
    });

    it('a mesma tupla com ocorrência diferente dá chaves diferentes', () => {
        expect(service.of({ ...base, occurrence: 1 })).not.toBe(service.of({ ...base, occurrence: 2 }));
    });

    it('o mesmo arquivo dá as mesmas chaves', () => {
        expect(service.of({ ...base, occurrence: 1 })).toBe(service.of({ ...base, occurrence: 1 }));
    });

    it('qualquer campo diferente muda a chave', () => {
        const reference: string = service.of({ ...base, occurrence: 1 });

        expect(service.of({ ...base, accountId: 'other', occurrence: 1 })).not.toBe(reference);
        expect(service.of({ ...base, date: '2026-09-11', occurrence: 1 })).not.toBe(reference);
        expect(service.of({ ...base, amountMinor: -5001, occurrence: 1 })).not.toBe(reference);
        expect(service.of({ ...base, normalizedDescription: 'CHA', occurrence: 1 })).not.toBe(reference);
    });
});
