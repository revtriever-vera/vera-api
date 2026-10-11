import { describe, expect, it } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { SpendingDatasetService } from './spending-dataset.service';
import { SpendingSampleDatasetService } from './spending-sample-dataset.service';

const TODAY: string = '2026-10-11';

function build(locale: AppLocale): SpendingSampleDatasetService {
    const context: AppContext = { get: () => ({ requestId: 'r', locale }) } as unknown as AppContext;
    return new SpendingSampleDatasetService(new SpendingDatasetService(), context);
}

describe('SpendingSampleDatasetService', () => {
    it('nomeia as contas de exemplo em português', () => {
        expect(
            build('pt-BR')
                .build(TODAY)
                .accounts.map((account) => account.name)
        ).toEqual(['Cartão de exemplo', 'Conta de exemplo', 'Conta 2 de exemplo']);
    });

    it('nomeia as contas de exemplo em inglês', () => {
        expect(
            build('en')
                .build(TODAY)
                .accounts.map((account) => account.name)
        ).toEqual(['Sample card', 'Sample account', 'Sample account 2']);
    });

    it('não altera transações nem demais campos do conjunto canônico', () => {
        const canonical = new SpendingDatasetService().build(TODAY);
        const english = build('en').build(TODAY);

        expect(english.transactions).toEqual(canonical.transactions);
        expect(english.accounts.map(({ name: _name, ...rest }) => rest)).toEqual(
            canonical.accounts.map(({ name: _name, ...rest }) => rest)
        );
    });
});
