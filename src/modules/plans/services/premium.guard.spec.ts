import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PlanGateService } from './plan-gate.service';
import { PremiumGuard } from './premium.guard';

function context(): ExecutionContext {
    return { getHandler: (): object => ({}), getClass: (): object => ({}) } as unknown as ExecutionContext;
}

describe('PremiumGuard', () => {
    it('deixa passar sem metadado, sem consultar o portão', async () => {
        const assert = vi.fn();
        const reflector: Reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
        const guard: PremiumGuard = new PremiumGuard(reflector, { assert } as unknown as PlanGateService);

        expect(await guard.canActivate(context())).toBe(true);
        expect(assert).not.toHaveBeenCalled();
    });

    it('com o metadado, consulta o portão e propaga a recusa', async () => {
        const reflector: Reflector = { getAllAndOverride: vi.fn().mockReturnValue('ai') } as unknown as Reflector;
        const assert = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('402'));
        const guard: PremiumGuard = new PremiumGuard(reflector, { assert } as unknown as PlanGateService);

        expect(await guard.canActivate(context())).toBe(true);
        expect(assert).toHaveBeenCalledWith('ai');
        await expect(guard.canActivate(context())).rejects.toThrow('402');
    });

    it('rota que não gasta cota passa com a cota esgotada, mas não com plano ou chave faltando', async () => {
        const reflector: Reflector = {
            getAllAndOverride: vi.fn().mockImplementation((key: string) => (key === 'plans:allow-paused' ? true : 'whatsapp'))
        } as unknown as Reflector;
        const assert = vi.fn().mockRejectedValue(new Error('402'));
        const stateOf = vi.fn().mockResolvedValueOnce('paused').mockResolvedValueOnce('premium_required');
        const guard: PremiumGuard = new PremiumGuard(reflector, { assert, stateOf } as unknown as PlanGateService);

        expect(await guard.canActivate(context())).toBe(true);
        expect(assert).not.toHaveBeenCalled();
        await expect(guard.canActivate(context())).rejects.toThrow('402');
    });
});
