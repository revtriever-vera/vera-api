import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { InvalidHolderError } from '../../identity/services/member-directory.service';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { IssuersLogService } from '../../issuers/services/issuers-log.service';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import {
    InvalidTermsError,
    IssuerKindMismatchError,
    TitleLimitReachedError,
    TitleNotFoundError,
    UnknownIssuerError
} from '../domain/fixed-income.errors';
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

function directory(): IssuerDirectoryService {
    const service: IssuerDirectoryService = new IssuerDirectoryService({
        loaded: vi.fn(),
        failed: vi.fn()
    } as unknown as IssuersLogService);
    service.onModuleInit();
    return service;
}

function build(options: { count?: number; existing?: boolean; removed?: boolean; issuerId?: string } = {}) {
    const created = makeTitle({ id: 'new-1' });
    const titles = {
        count: vi.fn().mockResolvedValue(options.count ?? 0),
        create: vi.fn().mockResolvedValue(created),
        findById: vi.fn().mockResolvedValue(options.existing === false ? null : makeTitle({ issuerId: options.issuerId ?? null })),
        update: vi.fn().mockImplementation((_id: string, draft: object) => Promise.resolve({ ...makeTitle(), ...draft })),
        remove: vi.fn().mockResolvedValue(options.removed ?? true)
    };
    const resolveBySystemKey = vi.fn().mockResolvedValue({ id: 'class-suggested' });
    const assign = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);
    const titleChanged = vi.fn();
    const requireActive = vi
        .fn()
        .mockImplementation((userId: string) =>
            userId === 'outsider' ? Promise.reject(new InvalidHolderError()) : Promise.resolve({ userId, name: 'Ana' })
        );
    const application = new FixedIncomeTitleApplication(
        titles as unknown as FixedIncomeTitleDomain,
        { valueTitleNow: vi.fn().mockResolvedValue(VALUATION) } as unknown as FixedIncomeValuationService,
        { resolveBySystemKey } as unknown as ClassResolverService,
        {
            assign,
            release,
            listForCompany: vi.fn().mockResolvedValue([{ subjectType: 'fixed_income', subjectId: 'new-1', classId: 'class-suggested' }])
        } as unknown as ClassAssignmentService,
        { titleChanged } as unknown as FixedIncomeLogService,
        directory(),
        { requireActive } as unknown as MemberDirectoryService
    );
    return { application, titles, requireActive, resolveBySystemKey, assign, release, titleChanged };
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

    it('grava o titular informado depois de validar que é membro ativo', async () => {
        const doubles = build();

        await doubles.application.create({ ...INPUT, holderUserId: 'ana' });

        expect(doubles.requireActive).toHaveBeenCalledWith('ana');
        expect(doubles.titles.create.mock.calls[0]?.[0]).toMatchObject({ holderUserId: 'ana' });
    });

    it('sem titular o título é da conta toda, e quem não é membro é recusado', async () => {
        const doubles = build();

        await doubles.application.create(INPUT);
        await expect(doubles.application.create({ ...INPUT, holderUserId: 'outsider' })).rejects.toBeInstanceOf(InvalidHolderError);

        expect(doubles.titles.create.mock.calls[0]?.[0]).toMatchObject({ holderUserId: null });
        expect(doubles.titles.create).toHaveBeenCalledTimes(1);
    });

    it('troca o titular na edição e recusa quem não é membro', async () => {
        const doubles = build();

        await doubles.application.update('title-1', { holderUserId: 'ana' });
        await expect(doubles.application.update('title-1', { holderUserId: 'outsider' })).rejects.toBeInstanceOf(InvalidHolderError);
        await doubles.application.update('title-1', { holderUserId: null });

        expect(doubles.titles.update.mock.calls[0]?.[1]).toMatchObject({ holderUserId: 'ana' });
        expect(doubles.titles.update.mock.calls[1]?.[1]).toMatchObject({ holderUserId: null });
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

    it('grava o emissor informado e o devolve com o conglomerado atual', async () => {
        const doubles = build({ issuerId: 'banco-pan' });
        doubles.titles.create.mockResolvedValue(makeTitle({ id: 'new-1', issuerId: 'banco-pan' }));

        const view = await doubles.application.create({ ...INPUT, issuerId: 'banco-pan' });

        expect(doubles.titles.create.mock.calls[0]?.[0]).toMatchObject({ issuerId: 'banco-pan' });
        expect(view).toMatchObject({
            needsIssuer: false,
            issuer: {
                id: 'banco-pan',
                name: 'Banco Pan',
                groupId: 'btg-pactual',
                groupName: 'BTG Pactual',
                kind: 'bank',
                fgcAssociated: true
            }
        });
    });

    it('cadastra sem emissor e marca que o cadastro está incompleto', async () => {
        const doubles = build();

        const view = await doubles.application.create(INPUT);

        expect(doubles.titles.create.mock.calls[0]?.[0]).toMatchObject({ issuerId: null });
        expect(view).toMatchObject({ issuer: null, needsIssuer: true });
    });

    it('recusa emissor fora da lista e emissor de tipo errado sem gravar', async () => {
        const doubles = build();

        await expect(doubles.application.create({ ...INPUT, issuerId: 'banco-que-nao-existe' })).rejects.toBeInstanceOf(UnknownIssuerError);
        await expect(doubles.application.create({ ...INPUT, kind: 'lci', issuerId: 'petrobras' })).rejects.toBeInstanceOf(
            IssuerKindMismatchError
        );
        await expect(doubles.application.create({ ...INPUT, kind: 'debenture', issuerId: 'banco-inter' })).rejects.toBeInstanceOf(
            IssuerKindMismatchError
        );
        expect(doubles.titles.create).not.toHaveBeenCalled();
    });

    it('troca o emissor na edição e remove com null', async () => {
        const doubles = build({ issuerId: 'banco-inter' });

        await doubles.application.update('title-1', { issuerId: 'bradesco' });
        await doubles.application.update('title-1', { issuerId: null });

        expect(doubles.titles.update.mock.calls[0]?.[1]).toMatchObject({ issuerId: 'bradesco' });
        expect(doubles.titles.update.mock.calls[1]?.[1]).toMatchObject({ issuerId: null });
    });

    it('revalida o emissor guardado quando a edição muda o tipo do título', async () => {
        const doubles = build({ issuerId: 'banco-inter' });

        await expect(doubles.application.update('title-1', { kind: 'debenture' })).rejects.toBeInstanceOf(IssuerKindMismatchError);
        await expect(doubles.application.update('title-1', { issuerId: 'nao-existe' })).rejects.toBeInstanceOf(UnknownIssuerError);
        expect(doubles.titles.update).not.toHaveBeenCalled();
    });

    it('trata como sem emissor o título cujo emissor sumiu da lista', async () => {
        const doubles = build({ issuerId: 'banco-que-sumiu' });

        await expect(doubles.application.get('title-1')).resolves.toMatchObject({ issuer: null, needsIssuer: true });
    });
});
