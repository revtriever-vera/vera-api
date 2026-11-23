import { describe, expect, it, vi } from 'vitest';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringDetectionService } from './recurring-detection.service';
import { RecurringSampleDataService } from './recurring-sample-data.service';

function build(accounts: readonly { id: string; isSample: boolean }[], series: readonly { accountId: string }[] = []) {
    const run: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ created: 3 });
    const removeOfAccounts: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(['s1', 's2']);
    const removeOfSeries: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const service: RecurringSampleDataService = new RecurringSampleDataService(
        { run } as unknown as RecurringDetectionService,
        { list: vi.fn().mockResolvedValue(series), removeOfAccounts } as unknown as RecurringSeriesDomain,
        { removeOfSeries } as unknown as RecurringAlertsDomain,
        { list: vi.fn().mockResolvedValue(accounts) } as unknown as FinancialAccountService
    );
    return { service, run, removeOfAccounts, removeOfSeries };
}

describe('RecurringSampleDataService', () => {
    it('detecta sobre o exemplo e devolve quantas séries nasceram', async () => {
        const { service, run } = build([{ id: 'a1', isSample: true }]);

        expect(await service.seed()).toBe(3);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('sem conta de exemplo não escreve nada e não roda a detecção', async () => {
        const { service, run } = build([{ id: 'a1', isSample: false }]);

        expect(await service.seed()).toBe(0);
        expect(run).not.toHaveBeenCalled();
    });

    it('ao limpar, remove as séries das contas que já não existem, uma vez por conta, e os alertas delas', async () => {
        const { service, removeOfAccounts, removeOfSeries } = build(
            [{ id: 'real', isSample: false }],
            [{ accountId: 'gone' }, { accountId: 'gone' }, { accountId: 'real' }]
        );

        expect(await service.clear()).toBe(2);
        expect(removeOfAccounts).toHaveBeenCalledWith(['gone']);
        expect(removeOfSeries).toHaveBeenCalledWith(['s1', 's2']);
    });

    it('usa uma área depois de spending, para semear depois das transações de exemplo', () => {
        expect(build([]).service.area.localeCompare('spending')).toBeGreaterThan(0);
    });
});
