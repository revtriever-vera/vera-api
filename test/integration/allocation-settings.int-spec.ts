import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PortfolioSettingsReaderService } from '../../src/modules/allocation/services/portfolio-settings-reader.service';
import { Account, AllocationHarness } from './support/allocation-harness';

interface SettingsBody {
    readonly baseCurrency: string;
    readonly toleranceBps: number;
}

interface ProblemBody {
    readonly type: string;
}

describe('allocation settings', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('alloc_settings');
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function rowsOf(companyId: string): Promise<number> {
        const result = await harness.pg.query('SELECT 1 FROM "PortfolioSettings" WHERE "companyId" = $1 AND "deletedAt" IS NULL', [
            companyId
        ]);
        return result.rowCount ?? 0;
    }

    it('primeira leitura cria BRL e 500; PUT muda e persiste; PUT parcial preserva o outro campo', async () => {
        const account: Account = await harness.signUp('settings-flow');

        const first = await harness.call<SettingsBody>(account.token, 'GET', '/allocation/settings');
        const currency = await harness.call<SettingsBody>(account.token, 'PUT', '/allocation/settings', { baseCurrency: 'USD' });
        const tolerance = await harness.call<SettingsBody>(account.token, 'PUT', '/allocation/settings', { toleranceBps: 0 });
        const reread = await harness.call<SettingsBody>(account.token, 'GET', '/allocation/settings');
        const empty = await harness.call<SettingsBody>(account.token, 'PUT', '/allocation/settings', {});

        expect(first.body).toEqual({ baseCurrency: 'BRL', toleranceBps: 500 });
        expect(currency.body).toEqual({ baseCurrency: 'USD', toleranceBps: 500 });
        expect(tolerance.body).toEqual({ baseCurrency: 'USD', toleranceBps: 0 });
        expect(reread.body).toEqual({ baseCurrency: 'USD', toleranceBps: 0 });
        expect(empty.body).toEqual({ baseCurrency: 'USD', toleranceBps: 0 });
        expect(await rowsOf(account.company.id)).toBe(1);
    });

    it('PUT como primeira chamada também cria a linha', async () => {
        const account: Account = await harness.signUp('settings-put-first');

        const response = await harness.call<SettingsBody>(account.token, 'PUT', '/allocation/settings', { toleranceBps: 2000 });

        expect(response.body).toEqual({ baseCurrency: 'BRL', toleranceBps: 2000 });
    });

    it('rejeita tolerância 2001, negativa, fracionária e moeda EUR', async () => {
        const account: Account = await harness.signUp('settings-invalid');

        for (const body of [{ toleranceBps: 2001 }, { toleranceBps: -1 }, { toleranceBps: 1.5 }, { baseCurrency: 'EUR' }, { extra: 1 }]) {
            const response = await harness.call<ProblemBody>(account.token, 'PUT', '/allocation/settings', body);
            expect(response.status).toBe(400);
        }
    });

    it('leituras concorrentes não duplicam a linha', async () => {
        const account: Account = await harness.signUp('settings-concurrent');

        const responses = await Promise.all(
            Array.from({ length: 8 }, async () => harness.call<SettingsBody>(account.token, 'GET', '/allocation/settings'))
        );

        expect(responses.every((response) => response.status === 200)).toBe(true);
        expect(await rowsOf(account.company.id)).toBe(1);
    });

    it('o service exportado lê as settings da company do contexto', async () => {
        const account: Account = await harness.signUp('settings-service');
        await harness.call(account.token, 'PUT', '/allocation/settings', { baseCurrency: 'USD', toleranceBps: 700 });
        const reader: PortfolioSettingsReaderService = harness.app.get(PortfolioSettingsReaderService, { strict: false });

        const view = await harness.inCompany(account.company.id, async () => reader.get());

        expect(view).toEqual({ baseCurrency: 'USD', toleranceBps: 700 });
    });

    it('isolamento: cada company tem as suas settings e sem sessão é 401', async () => {
        const a: Account = await harness.signUp('settings-iso-a');
        const b: Account = await harness.signUp('settings-iso-b');

        await harness.call(a.token, 'PUT', '/allocation/settings', { baseCurrency: 'USD', toleranceBps: 100 });
        const readB = await harness.call<SettingsBody>(b.token, 'GET', '/allocation/settings');
        const readA = await harness.call<SettingsBody>(a.token, 'GET', '/allocation/settings');
        const anonymousGet = await harness.call<ProblemBody>(null, 'GET', '/allocation/settings');
        const anonymousPut = await harness.call<ProblemBody>(null, 'PUT', '/allocation/settings', { toleranceBps: 1 });

        expect(readB.body).toEqual({ baseCurrency: 'BRL', toleranceBps: 500 });
        expect(readA.body).toEqual({ baseCurrency: 'USD', toleranceBps: 100 });
        expect(anonymousGet.status).toBe(401);
        expect(anonymousPut.status).toBe(401);
    });
});
