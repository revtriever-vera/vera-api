import { describe, expect, it } from 'vitest';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { RECOVERY_CODE_COUNT, RecoveryCodeService } from './recovery-code.service';

const hmac: HmacPort = { sha256Hex: (value: string): string => `h(${value})` };
const service: RecoveryCodeService = new RecoveryCodeService(hmac);

describe('RecoveryCodeService', () => {
    it('gera dez códigos distintos no formato xxxxx-xxxxx e só o hash fica para guardar', () => {
        const batch = service.generateBatch();

        expect(batch.codes).toHaveLength(RECOVERY_CODE_COUNT);
        expect(new Set(batch.codes).size).toBe(RECOVERY_CODE_COUNT);
        for (const code of batch.codes) {
            expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
        }
        expect(batch.hashes).toEqual(batch.codes.map((code: string): string => service.hash(code)));
        expect(batch.hashes.join('')).not.toContain(batch.codes[0] ?? 'x');
    });

    it('o hash ignora caixa, espaço e hífen, então o código digitado de qualquer jeito casa', () => {
        expect(service.hash('ABCDE-FGHJK')).toBe(service.hash(' abcde fghjk '));
        expect(service.hash('abcdefghjk')).toBe(service.hash('abcde-fghjk'));
        expect(service.hash('abcde-fghjk')).not.toBe(service.hash('abcde-fghjm'));
    });
});
