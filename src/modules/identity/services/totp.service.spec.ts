import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticator } from 'otplib';
import { TotpService } from './totp.service';

const service: TotpService = new TotpService();
const SECRET: string = 'JBSWY3DPEHPK3PXP';
const STEP_MS: number = 30_000;
const BASE: number = 1_800_000_000_000;

function codeAt(time: number): string {
    vi.setSystemTime(time);
    return authenticator.generate(SECRET);
}

describe('TotpService', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('gera um segredo base32 e a URI otpauth com o emissor "Vera admin"', () => {
        const secret: string = service.generateSecret();
        const uri: string = service.buildOtpAuthUri('admin@example.test', secret);

        expect(secret).toMatch(/^[A-Z2-7]+$/);
        expect(uri).toMatch(/^otpauth:\/\/totp\/Vera%20admin:admin%40example\.test\?/);
        expect(uri).toContain(`secret=${secret}`);
        expect(uri).toContain('issuer=Vera%20admin');
    });

    it('aceita o código da janela atual e o da anterior, devolvendo o passo', () => {
        vi.useFakeTimers();
        const current: string = codeAt(BASE);
        const previous: string = codeAt(BASE - STEP_MS);
        vi.setSystemTime(BASE);

        const step: number = Math.floor(BASE / STEP_MS);
        expect(service.matchedStep(current, SECRET)).toBe(step);
        expect(service.matchedStep(previous, SECRET)).toBe(step - 1);
    });

    it('recusa o código de duas janelas atrás e o da janela seguinte', () => {
        vi.useFakeTimers();
        const old: string = codeAt(BASE - 2 * STEP_MS);
        const future: string = codeAt(BASE + STEP_MS);
        vi.setSystemTime(BASE);

        expect(service.matchedStep(old, SECRET)).toBeNull();
        expect(service.matchedStep(future, SECRET)).toBeNull();
        expect(service.matchedStep('000000', SECRET)).not.toBe(Math.floor(BASE / STEP_MS) + 5);
    });

    it('distingue código de seis dígitos de código de recuperação', () => {
        expect(service.looksLikeCode('123456')).toBe(true);
        expect(service.looksLikeCode(' 123456 ')).toBe(true);
        expect(service.looksLikeCode('abcde-fghjk')).toBe(false);
        expect(service.looksLikeCode('1234567')).toBe(false);
    });
});
