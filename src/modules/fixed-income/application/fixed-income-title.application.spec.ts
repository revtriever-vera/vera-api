import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { InvalidTermsError, TitleLimitReachedError, TitleNotFoundError } from '../domain/fixed-income.errors';
import { FixedIncomeLogService } from '../services/fixed-income-log.service';
import { FixedIncomeValuationService } from '../services/fixed-income-valuation.service';
import { FixedIncomeTitleApplication } from './fixed-income-title.application';

const VALUATION = { valueMinor: 10_500_000, status: 'ok' };
const INPUT = {
    kind: 'cdb' as const,
    name: 'CDB Banco Exemplo',
    indexer: 'cdi_percent' as const,
    rateBps: 11000,
    appliedMinor: 10_000_000,
    appliedAt: '2025-01-06',
    maturityDate: '2030-01-06'
};

function build(options: { count?: number; existing?: boolean; removed?: boolean } = {}) {
    const created = makeTitle({ id: 'new-1' });
    const titles = {
        count: vi.fn().mockResolvedValue(options.count ?? 0),
        create: vi.fn().mockResolvedValue(created),
        findById: vi.fn().mockResolvedValue(options.existing === false ? null : makeTitle()),
        update: vi.fn().mockImplementation((_id: string, draft: object) => Promise.resolve({ ...makeTitle(), ...draft })),
        remove: vi.fn().mockResolvedValue(options.removed ?? true)
    };
    const resolveBySystemKey = vi.fn().mockResolvedValue({ id: 'class-suggested' });
    const assign = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);
    const titleChanged = vi.fn();
    const application = new FixedIncomeTitleApplication(
        titles as unknown as FixedIncomeTitleDomain,
        { valueTitleNow: vi.fn().mockResolvedValue(VALUATION) } as unknown as FixedIncomeValuationService,
        { resolveBySystemKey } as unknown as ClassResolverService,
        {
            assign,
            release,
            listForCompany: vi.fn().mockResolvedValue([{ subjectType: 'fixed_income', subjectId: 'new-1', classId: 'class-suggested' }])
        } as unknown as ClassAssignmentService,
        { titleChanged } as unknown as FixedIncomeLogService
    );
    return { application, titles, resolveBySystemKey, assign, release, titleChanged };
}

describe('FixedIncomeTitleApplication', () => {
    beforeAll(() => {
        TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
    });

    it('cadastra com a classe sugerida pelo indexador e devolve a valorização', async () => {
        const doubles = build();

        const view = await doubles.application.create(INPUT);

        expect(doubles.resolveBySystemKey).toHaveBeenCalledWith('rf_pos');
        expect(doubles.assign).toHaveBeenCalledWith('fixed_income', 'new-1', 'class-suggested');
        expect(doubles.titles.create.mock.calls[0]?.[0]).toMatchObject({ currency: 'BRL', name: 'CDB Banco Exemplo' });
        expect(view).toMatchObject({ id: 'new-1', classId: 'class-suggested', valuation: VALUATION });
        expect(doubles.titleChanged).toHaveBeenCalledWith('created', 'new-1', 'cdb', 'cdi_percent');
    });

    it.each([
        ['prefixed' as const, 1200, 'rf_pre'],
        ['ipca_plus' as const, 600, 'rf_ipca']
    ])('sugere a classe pelo indexador %s', async (indexer, rateBps, key) => {
        const doubles = build();

        await doubles.application.create({ ...INPUT, indexer, rateBps });

        expect(doubles.resolveBySystemKey).toHaveBeenCalledWith(key);
    });

    it('usa a classe enviada sem consultar a sugerida', async () => {
        const doubles = build();

        await doubles.application.create({ ...INPUT, classId: 'class-chosen' });

        expect(doubles.resolveBySystemKey).not.toHaveBeenCalled();
        expect(doubles.assign).toHaveBeenCalledWith('fixed_income', 'new-1', 'class-chosen');
    });

    it('recusa o 201º título e termos inválidos sem gravar', async () => {
        const full = build({ count: 200 });
        await expect(full.application.create(INPUT)).rejects.toBeInstanceOf(TitleLimitReachedError);
        expect(full.titles.create).not.toHaveBeenCalled();

        const invalid = build();
        await expect(invalid.application.create({ ...INPUT, currency: 'USD' })).rejects.toBeInstanceOf(InvalidTermsError);
        expect(invalid.titles.create).not.toHaveBeenCalled();
    });

    it('lê um título e falha quando não existe', async () => {
        await expect(build().application.get('title-1')).resolves.toMatchObject({ valuation: VALUATION });
        await expect(build({ existing: false }).application.get('x')).rejects.toBeInstanceOf(TitleNotFoundError);
    });

    it('edita mesclando só os campos enviados e revalida', async () => {
        const doubles = build();

        const view = await doubles.application.update('title-1', { rateBps: 12000, name: undefined });

        expect(doubles.titles.update.mock.calls[0]).toMatchObject(['title-1', { rateBps: 12000, name: 'CDB Banco Exemplo', kind: 'cdb' }]);
        expect(view.rateBps).toBe(12000);
        expect(doubles.titleChanged).toHaveBeenCalledWith('updated', 'title-1', 'cdb', 'cdi_percent');
    });

    it('edição que cria conflito entre campos é recusada', async () => {
        const doubles = build();

        await expect(doubles.application.update('title-1', { currency: 'USD' })).rejects.toBeInstanceOf(InvalidTermsError);
        await expect(doubles.application.update('title-1', { maturityDate: '2025-01-06' })).rejects.toBeInstanceOf(InvalidTermsError);
        expect(doubles.titles.update).not.toHaveBeenCalled();
    });

    it('editar título inexistente (ou de outra company) é 404', async () => {
        await expect(build({ existing: false }).application.update('x', { rateBps: 1 })).rejects.toBeInstanceOf(TitleNotFoundError);
    });

    it('edição que perde a corrida contra a remoção é 404', async () => {
        const doubles = build();
        doubles.titles.update.mockResolvedValue(null);

        await expect(doubles.application.update('title-1', { rateBps: 12000 })).rejects.toBeInstanceOf(TitleNotFoundError);
    });

    it('remove o título e libera a atribuição de classe', async () => {
        const doubles = build();

        await doubles.application.remove('title-1');

        expect(doubles.titles.remove).toHaveBeenCalledWith('title-1');
        expect(doubles.release).toHaveBeenCalledWith('fixed_income', 'title-1');
        expect(doubles.titleChanged).toHaveBeenCalledWith('deleted', 'title-1', 'cdb', 'cdi_percent');
    });

    it('remover título inexistente é 404 e não libera nada', async () => {
        const missing = build({ existing: false });
        await expect(missing.application.remove('x')).rejects.toBeInstanceOf(TitleNotFoundError);
        const raced = build({ removed: false });
        await expect(raced.application.remove('title-1')).rejects.toBeInstanceOf(TitleNotFoundError);
        expect(missing.release).not.toHaveBeenCalled();
        expect(raced.release).not.toHaveBeenCalled();
    });
});
