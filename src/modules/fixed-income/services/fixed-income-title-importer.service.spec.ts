import { describe, expect, it, vi } from 'vitest';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { FixedIncomeLogService } from './fixed-income-log.service';
import { FixedIncomeTitleImporterService, ImportedTitleDraft } from './fixed-income-title-importer.service';

const DRAFT: ImportedTitleDraft = {
    name: 'CDB EXEMPLO',
    kind: 'cdb',
    issuerId: null,
    indexer: 'cdi_percent',
    rateBps: 11200,
    appliedMinor: 1000000,
    appliedAt: '2024-03-15',
    maturityDate: '2028-03-15'
};

function build(overrides: { count?: number; listReal?: unknown[] } = {}) {
    const titles = {
        count: vi.fn().mockResolvedValue(overrides.count ?? 0),
        listReal: vi.fn().mockResolvedValue(overrides.listReal ?? []),
        createImported: vi.fn().mockResolvedValue(makeTitle({ id: 'title-1' })),
        listByImport: vi.fn().mockResolvedValue([makeTitle({ id: 'title-1' }), makeTitle({ id: 'title-2' })]),
        remove: vi.fn().mockResolvedValue(true)
    };
    const classResolver = { resolveBySystemKey: vi.fn().mockResolvedValue({ id: 'class-1' }) };
    const assignments = { assign: vi.fn(), release: vi.fn() };
    const logs = { titleChanged: vi.fn() };
    const issuers = {
        search: vi.fn().mockReturnValue([{ id: 'banco-exemplo', name: 'Banco Exemplo' }]),
        accepts: vi.fn().mockReturnValue(true),
        find: vi.fn().mockReturnValue({ id: 'banco-exemplo', kind: 'bank' })
    };
    const members = { requireActive: vi.fn() };
    const service: FixedIncomeTitleImporterService = new FixedIncomeTitleImporterService(
        titles as unknown as FixedIncomeTitleDomain,
        classResolver as unknown as ClassResolverService,
        assignments as unknown as ClassAssignmentService,
        logs as unknown as FixedIncomeLogService,
        issuers as unknown as IssuerDirectoryService,
        members as unknown as MemberDirectoryService
    );
    return { service, titles, classResolver, assignments, logs, issuers, members };
}

describe('FixedIncomeTitleImporterService.matchIssuer', () => {
    it('aceita só o nome igual, sem maiúsculas nem acentos', () => {
        const { service } = build();

        expect(service.matchIssuer('BANCO EXEMPLO', 'cdb')).toBe('banco-exemplo');
        expect(service.matchIssuer('Banco Exemplo S.A.', 'cdb')).toBeNull();
        expect(service.matchIssuer(null, 'cdb')).toBeNull();
        expect(service.matchIssuer('  ', 'cdb')).toBeNull();
    });
});

describe('FixedIncomeTitleImporterService.duplicates', () => {
    it('compara emissor, indexador, vencimento e valor', async () => {
        const existing = makeTitle({
            issuerId: 'banco-exemplo',
            indexer: 'cdi_percent',
            maturityDate: '2028-03-15',
            appliedMinor: 1000000
        });
        const { service } = build({ listReal: [existing] });
        const same = {
            issuerId: 'banco-exemplo',
            name: 'x',
            indexer: 'cdi_percent' as const,
            maturityDate: '2028-03-15',
            appliedMinor: 1000000
        };

        expect(await service.duplicates([same, { ...same, appliedMinor: 1 }, { ...same, maturityDate: '2029-03-15' }, null])).toEqual([
            true,
            false,
            false,
            false
        ]);
    });

    it('sem emissor reconhecido compara o nome', async () => {
        const existing = makeTitle({
            issuerId: null,
            name: 'CDB Exemplo',
            indexer: 'cdi_percent',
            maturityDate: '2028-03-15',
            appliedMinor: 1000000
        });
        const { service } = build({ listReal: [existing] });

        expect(
            await service.duplicates([
                { issuerId: null, name: 'cdb exemplo', indexer: 'cdi_percent', maturityDate: '2028-03-15', appliedMinor: 1000000 }
            ])
        ).toEqual([true]);
    });
});

describe('FixedIncomeTitleImporterService.createAll', () => {
    it('cria cada título ligado à importação, com classe e log', async () => {
        const { service, titles, assignments, logs, members } = build();

        const ids = await service.createAll([DRAFT], 'import-1', 'user-1');

        expect(ids).toEqual(['title-1']);
        expect(members.requireActive).toHaveBeenCalledWith('user-1');
        expect(titles.createImported).toHaveBeenCalledWith(
            expect.objectContaining({ currency: 'BRL', holderUserId: 'user-1' }),
            'import-1'
        );
        expect(assignments.assign).toHaveBeenCalledWith('fixed_income', 'title-1', 'class-1');
        expect(logs.titleChanged).toHaveBeenCalledWith('created', 'title-1', expect.any(String), expect.any(String));
    });

    it('não faz nada sem títulos', async () => {
        const { service, titles } = build();

        expect(await service.createAll([], 'import-1', null)).toEqual([]);
        expect(titles.count).not.toHaveBeenCalled();
    });

    it('recusa passar do limite por company', async () => {
        const { service, titles } = build({ count: 200 });

        await expect(service.createAll([DRAFT], 'import-1', null)).rejects.toMatchObject({ code: 'fixed_income.limit_reached' });
        expect(titles.createImported).not.toHaveBeenCalled();
    });

    it('recusa termos inconsistentes e emissor que não serve ao título', async () => {
        const { service, issuers } = build();

        await expect(service.createAll([{ ...DRAFT, maturityDate: '2024-03-15' }], 'import-1', null)).rejects.toMatchObject({
            code: 'fixed_income.invalid_terms'
        });
        issuers.accepts.mockReturnValue(false);
        await expect(service.createAll([{ ...DRAFT, issuerId: 'banco-exemplo' }], 'import-1', null)).rejects.toMatchObject({
            code: 'fixed_income.issuer_kind_mismatch'
        });
        issuers.find.mockReturnValue(null);
        await expect(service.createAll([{ ...DRAFT, issuerId: 'fantasma' }], 'import-1', null)).rejects.toMatchObject({
            code: 'fixed_income.unknown_issuer'
        });
    });
});

describe('FixedIncomeTitleImporterService.removeByImport', () => {
    it('remove os títulos da importação e solta a classe de cada um', async () => {
        const { service, titles, assignments } = build();

        expect(await service.removeByImport('import-1')).toBe(2);
        expect(titles.remove.mock.calls.map((call: unknown[]): unknown => call[0])).toEqual(['title-1', 'title-2']);
        expect(assignments.release).toHaveBeenCalledTimes(2);
    });
});
