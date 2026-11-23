import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { CompanyDomain } from '../domain/company.domain';
import { User } from '../domain/identity.types';
import { AccountDeletionLogDomain } from '../domain/account-deletion-log.domain';
import { UserDomain } from '../domain/user.domain';
import { AccountDataRegistry } from './account-data.registry';
import { AccountEmptinessService } from './account-emptiness.service';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);

async function inContext<T>(fn: () => Promise<T>): Promise<T> {
    return context.run({ requestId: 'test', locale: 'pt-BR' }, fn);
}

class ScriptedSummary extends OnboardingAreaSummaryPort {
    public constructor(
        public readonly area: OnboardingArea,
        private readonly items: number | Error
    ) {
        super();
    }

    public summarize(): Promise<OnboardingAreaSummary> {
        return this.items instanceof Error
            ? Promise.reject(this.items)
            : Promise.resolve({ items: this.items, amountCents: null, currency: null });
    }
}

interface Rig {
    readonly service: AccountEmptinessService;
    readonly eraseAll: ReturnType<typeof vi.fn>;
    readonly eraseCompany: ReturnType<typeof vi.fn>;
}

function build(summaries: readonly ScriptedSummary[], members: number = 1): Rig {
    const eraseAll: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ area: 'assets', erased: 0 }]);
    const eraseCompany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
    const service: AccountEmptinessService = new AccountEmptinessService(
        { getProviders: () => summaries.map((instance: ScriptedSummary) => ({ instance })) } as unknown as DiscoveryService,
        { listMembers: vi.fn().mockResolvedValue(Array.from({ length: members }, (): User => ({}) as User)) } as unknown as UserDomain,
        { eraseCompany } as unknown as CompanyDomain,
        { record: vi.fn().mockResolvedValue({}) } as unknown as AccountDeletionLogDomain,
        { eraseAll } as unknown as AccountDataRegistry
    );
    return { service, eraseAll, eraseCompany };
}

describe('AccountEmptinessService', () => {
    it('é vazia quando nenhuma área tem item e só há uma pessoa', async () => {
        const rig: Rig = build([new ScriptedSummary('assets', 0), new ScriptedSummary('banks', 0)]);

        expect(await inContext(async () => rig.service.isEmpty('company-1'))).toBe(true);
    });

    it('cada área com dado, e mais de uma pessoa, torna a conta não vazia', async () => {
        expect(
            await inContext(async () => build([new ScriptedSummary('assets', 2), new ScriptedSummary('banks', 0)]).service.isEmpty('c'))
        ).toBe(false);
        expect(
            await inContext(async () => build([new ScriptedSummary('assets', 0), new ScriptedSummary('banks', 1)]).service.isEmpty('c'))
        ).toBe(false);
        expect(await inContext(async () => build([new ScriptedSummary('assets', 0)], 2).service.isEmpty('c'))).toBe(false);
    });

    it('na dúvida (a porta falhou) a conta não é vazia, e a meta não entra na conta', async () => {
        expect(await inContext(async () => build([new ScriptedSummary('assets', new Error('down'))]).service.isEmpty('c'))).toBe(false);
        expect(await inContext(async () => build([new ScriptedSummary('target', 5)]).service.isEmpty('c'))).toBe(true);
    });

    it('só apaga a company quando está vazia', async () => {
        const empty: Rig = build([new ScriptedSummary('assets', 0)]);
        const full: Rig = build([new ScriptedSummary('assets', 1)]);

        expect(await inContext(async () => empty.service.eraseIfEmpty('c'))).toBe(true);
        expect(await inContext(async () => full.service.eraseIfEmpty('c'))).toBe(false);

        expect(empty.eraseCompany).toHaveBeenCalledWith('c');
        expect(full.eraseAll).not.toHaveBeenCalled();
        expect(full.eraseCompany).not.toHaveBeenCalled();
    });
});
