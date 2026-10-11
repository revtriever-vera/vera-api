import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface ExportBody {
    readonly sections: Record<string, unknown>;
}

interface FixedIncomeSection {
    readonly titles: { readonly id: string; readonly name: string }[];
}

interface AllocationSection {
    readonly settings: { readonly baseCurrency: string; readonly toleranceBps: number };
    readonly classes: { readonly id: string; readonly systemKey: string | null; readonly targetBps: number }[];
    readonly assetTargets: { readonly subjectId: string; readonly classId: string; readonly targetInClassBps: number }[];
}

interface AreaSummary {
    readonly items: number;
    readonly amountCents: number | null;
    readonly currency: string | null;
    readonly breakdown?: Record<string, number>;
}

interface SummaryBody {
    readonly assets: AreaSummary | null;
    readonly banks: AreaSummary | null;
    readonly target: AreaSummary | null;
}

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface TitleBody {
    readonly id: string;
    readonly classId: string;
}

const TODAY: string = DateUtil.todayInBrazil();

function realTitle(name: string): Record<string, unknown> {
    return {
        kind: 'cdb',
        name,
        indexer: 'cdi_percent',
        rateBps: 11000,
        appliedMinor: 4_000_000,
        appliedAt: addDays(TODAY, -300),
        maturityDate: addDays(TODAY, 600)
    };
}

describe('ports of fixed-income and allocation', () => {
    let harness: AllocationHarness;
    let account: Account;
    let other: Account;

    beforeAll(async () => {
        harness = await AllocationHarness.start('fixed_income_allocation_ports');
        account = await harness.signUp('ports-a');
        other = await harness.signUp('ports-b');
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function exportSections(token: string): Promise<{ fixedIncome: FixedIncomeSection; allocation: AllocationSection }> {
        const response = await harness.call<ExportBody>(token, 'GET', '/account/export');
        expect(response.status).toBe(200);
        return {
            fixedIncome: response.body.sections['fixed_income'] as FixedIncomeSection,
            allocation: response.body.sections['allocation'] as AllocationSection
        };
    }

    async function rows(table: string, companyId: string, where: string = 'true'): Promise<number> {
        const result = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "${table}" WHERE "companyId" = $1 AND "deletedAt" IS NULL AND ${where}`,
            [companyId]
        );
        return Number(result.rows[0]?.total);
    }

    it('resumo target: carteira-alvo moderada inicial com as 8 classes e sem valor monetário', async () => {
        const response = await harness.call<SummaryBody>(account.token, 'GET', '/onboarding/summary');

        expect(response.status).toBe(200);
        expect(response.body.target).toEqual({ items: 8, amountCents: null, currency: null });
        expect(response.body.assets).toEqual({ items: 0, amountCents: null, currency: null });
    });

    it('resumo target conta só as classes com meta depois que o usuário zera uma', async () => {
        const classes = await harness.call<{ data: ClassBody[] }>(account.token, 'GET', '/allocation/classes');
        const cripto: ClassBody = classes.body.data.find((item: ClassBody) => item.systemKey === 'cripto') as ClassBody;
        const acoesBr: ClassBody = classes.body.data.find((item: ClassBody) => item.systemKey === 'acoes_br') as ClassBody;
        const saved = await harness.call(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [
                { classId: cripto.id, targetBps: 0 },
                { classId: acoesBr.id, targetBps: 2000 }
            ]
        });
        expect(saved.status).toBe(200);

        const response = await harness.call<SummaryBody>(account.token, 'GET', '/onboarding/summary');

        expect(response.body.target?.items).toBe(7);
    });

    it('exemplo: carrega 3 títulos marcados, nas classes de renda fixa, e não duplica na segunda carga', async () => {
        const first = await harness.call(account.token, 'POST', '/onboarding/sample');
        const second = await harness.call(account.token, 'POST', '/onboarding/sample');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(await rows('FixedIncomeTitles', account.company.id, '"isSample" = true')).toBe(3);
        expect(await rows('FixedIncomeTitles', account.company.id, '"isSample" = false')).toBe(0);
        expect(await rows('AssetClassAssignments', account.company.id, '"isSample" = true AND "subjectType" = \'fixed_income\'')).toBe(3);
        expect(await rows('FixedIncomeTitles', other.company.id)).toBe(0);
    });

    it('exportação: traz classes, metas e preferências da company e nenhuma linha de exemplo', async () => {
        const { fixedIncome, allocation } = await exportSections(account.token);

        expect(fixedIncome.titles).toEqual([]);
        expect(allocation.settings).toEqual({ baseCurrency: 'BRL', toleranceBps: 500 });
        expect(allocation.classes).toHaveLength(8);
        expect(allocation.classes.find((item) => item.systemKey === 'cripto')?.targetBps).toBe(0);
        expect(allocation.assetTargets).toEqual([]);
    });

    it('título real convive com a limpeza do exemplo: o semeador não roda e o clear só apaga exemplo', async () => {
        const created = await harness.call<TitleBody>(account.token, 'POST', '/fixed-income/titles', realTitle('CDB real'));
        expect(created.status).toBe(201);

        const clear = await harness.call(account.token, 'DELETE', '/onboarding/sample');
        const clearAgain = await harness.call(account.token, 'DELETE', '/onboarding/sample');

        expect(clear.status).toBe(200);
        expect(clearAgain.status).toBe(200);
        expect(await rows('FixedIncomeTitles', account.company.id, '"isSample" = true')).toBe(0);
        expect(await rows('AssetClassAssignments', account.company.id, '"isSample" = true')).toBe(0);
        expect(await rows('FixedIncomeTitles', account.company.id)).toBe(1);
        expect(await rows('AssetClassAssignments', account.company.id, '"subjectType" = \'fixed_income\'')).toBe(1);
    });

    it('com dado real, o exemplo não é carregado', async () => {
        await harness.call(account.token, 'POST', '/onboarding/sample');

        expect(await rows('FixedIncomeTitles', account.company.id)).toBe(1);
        expect(await rows('FixedIncomeTitles', account.company.id, '"isSample" = true')).toBe(0);
    });

    it('exportação: título real aparece só para a company dona, com a meta por ativo', async () => {
        const mine = await exportSections(account.token);
        const theirs = await exportSections(other.token);

        expect(mine.fixedIncome.titles.map((title) => title.name)).toEqual(['CDB real']);
        expect(mine.allocation.assetTargets.map((target) => target.subjectId)).toEqual([mine.fixedIncome.titles[0]?.id]);
        expect(theirs.fixedIncome.titles).toEqual([]);
        expect(theirs.allocation.assetTargets).toEqual([]);
        expect(JSON.stringify(theirs)).not.toContain(account.company.id);
    });

    it('resumo assets com só renda fixa conta o título real e fica escopado por conta', async () => {
        const mine = await harness.call<SummaryBody>(account.token, 'GET', '/onboarding/summary');
        const theirs = await harness.call<SummaryBody>(other.token, 'GET', '/onboarding/summary');

        expect(mine.body.assets?.items).toBe(1);
        expect(mine.body.assets?.amountCents).toBeGreaterThan(0);
        expect(mine.body.assets?.currency).toBe('BRL');
        expect(theirs.body.assets).toEqual({ items: 0, amountCents: null, currency: null });
    });

    it('exemplo exportado durante a vigência não vaza: assignments de exemplo ficam fora', async () => {
        const fresh: Account = await harness.signUp('ports-c');
        await harness.call(fresh.token, 'POST', '/onboarding/sample');

        const { fixedIncome, allocation } = await exportSections(fresh.token);
        const summary = await harness.call<SummaryBody>(fresh.token, 'GET', '/onboarding/summary');
        expect(summary.body.assets).toEqual({ items: 0, amountCents: null, currency: null });

        expect(fixedIncome.titles).toEqual([]);
        expect(allocation.assetTargets).toEqual([]);
        expect(await rows('AssetClassAssignments', fresh.company.id)).toBe(3);
    });

    it('apagar a conta remove títulos, atribuições e classes por cascata', async () => {
        const fresh: Account = await harness.signUp('ports-d');
        await harness.call(fresh.token, 'POST', '/onboarding/sample');
        expect(await rows('FixedIncomeTitles', fresh.company.id)).toBe(3);

        const deleted = await harness.call(fresh.token, 'DELETE', '/account', { confirmEmail: fresh.user.email });

        expect(deleted.status).toBe(204);
        for (const table of ['FixedIncomeTitles', 'AssetClassAssignments', 'AssetClasses']) {
            expect(await rows(table, fresh.company.id)).toBe(0);
        }
    });
});
