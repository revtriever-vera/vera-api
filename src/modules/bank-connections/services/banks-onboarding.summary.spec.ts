import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppContext, AppContextData } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { TransactionImportService } from '../../transactions/services/transaction-import.service';
import { BankConnectionReaderService } from './bank-connection-reader.service';
import { BanksOnboardingSummary } from './banks-onboarding.summary';

const runs: AppContextData[] = [];

function build(connections: number, imports: number): BanksOnboardingSummary {
    return new BanksOnboardingSummary(
        { countConnected: vi.fn().mockResolvedValue(connections) } as unknown as BankConnectionReaderService,
        { countCompleted: vi.fn().mockResolvedValue(imports) } as unknown as TransactionImportService
    );
}

describe('BanksOnboardingSummary', () => {
    beforeAll(() => {
        const context: AppContext = {
            run: <T>(data: AppContextData, fn: () => T): T => {
                runs.push(data);
                return fn();
            },
            get: (): AppContextData => ({ requestId: 'r', locale: 'pt-BR' }),
            getOrNull: (): AppContextData | null => null,
            enrich: vi.fn()
        };
        ContextHolder.set(context);
    });

    it('soma conexões e extratos e separa os dois no breakdown', async () => {
        const summary: BanksOnboardingSummary = build(2, 1);

        const result = await summary.summarize('company-1');

        expect(summary.area).toBe('banks');
        expect(result).toEqual({ items: 3, amountCents: null, currency: null, breakdown: { connections: 2, imports: 1 } });
    });

    it('sem conexão nem extrato, items é 0', async () => {
        const result = await build(0, 0).summarize('company-1');

        expect(result).toEqual({ items: 0, amountCents: null, currency: null, breakdown: { connections: 0, imports: 0 } });
    });

    it('roda dentro da company informada', async () => {
        runs.length = 0;

        await build(1, 0).summarize('company-9');

        expect(runs[0]?.companyId).toBe('company-9');
    });
});
