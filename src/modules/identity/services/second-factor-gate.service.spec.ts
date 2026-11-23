import { describe, expect, it, vi } from 'vitest';
import { ThrottleService, TooManyAttemptsError } from '../../../core/throttle/throttle.service';
import { InvalidTotpTokenError, PlatformDisabledError } from '../domain/identity.errors';
import { User } from '../domain/identity.types';
import { PlatformAvailabilityService } from './platform-availability.service';
import { SecondFactorGateService } from './second-factor-gate.service';
import { SecondFactorNotifierService } from './second-factor-notifier.service';
import { TokenService } from './token.service';

const USER: User = { id: 'user-1', companyId: 'company-1' } as User;

function build(options: { enabled?: boolean; claims?: unknown; attempts?: number } = {}): {
    gate: SecondFactorGateService;
    locked: ReturnType<typeof vi.fn>;
    countAttempt: ReturnType<typeof vi.fn>;
} {
    const locked: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const countAttempt: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(options.attempts ?? 1);
    const gate: SecondFactorGateService = new SecondFactorGateService(
        { enabled: () => options.enabled ?? true } as unknown as PlatformAvailabilityService,
        { verifySecondFactorToken: () => options.claims ?? null } as unknown as TokenService,
        { countAttempt } as unknown as ThrottleService,
        { locked } as unknown as SecondFactorNotifierService
    );
    return { gate, locked, countAttempt };
}

describe('SecondFactorGateService', () => {
    it('devolve os claims do token do passo', () => {
        const { gate } = build({ claims: { sub: 'user-1', companyId: 'company-1' } });

        expect(gate.claims('token', 'totp_challenge')).toEqual({ sub: 'user-1', companyId: 'company-1' });
    });

    it('token inválido responde identity.invalid_totp_token', () => {
        expect(() => build().gate.claims('token', 'totp_challenge')).toThrow(InvalidTotpTokenError);
    });

    it('na auto-hospedada responde 404 antes de olhar o token', () => {
        expect(() => build({ enabled: false, claims: { sub: 'u', companyId: 'c' } }).gate.claims('token', 'totp_challenge')).toThrow(
            PlatformDisabledError
        );
    });

    it('deixa passar até a quinta tentativa em 15 minutos, por usuário', async () => {
        const { gate, countAttempt, locked } = build({ attempts: 5 });

        await expect(gate.admit(USER, '203.0.113.1')).resolves.toBeUndefined();

        expect(countAttempt).toHaveBeenCalledWith('second-factor:user-1', 900);
        expect(locked).not.toHaveBeenCalled();
    });

    it('a sexta tentativa leva 429 e grava admin.totp_locked uma vez só', async () => {
        const first = build({ attempts: 6 });
        const next = build({ attempts: 7 });

        await expect(first.gate.admit(USER, '203.0.113.1')).rejects.toBeInstanceOf(TooManyAttemptsError);
        await expect(next.gate.admit(USER, '203.0.113.1')).rejects.toBeInstanceOf(TooManyAttemptsError);

        expect(first.locked).toHaveBeenCalledWith(USER, '203.0.113.1');
        expect(next.locked).not.toHaveBeenCalled();
    });
});
