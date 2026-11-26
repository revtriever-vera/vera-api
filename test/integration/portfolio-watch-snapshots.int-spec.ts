import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { PortfolioWatchSnapshotApplication } from '../../src/modules/portfolio-watch/application/portfolio-watch-snapshot.application';
import { PortfolioIncomeLedgerService } from '../../src/modules/portfolio-watch/services/portfolio-income-ledger.service';
import { PortfolioWatchExport } from '../../src/modules/portfolio-watch/services/portfolio-watch-account.exporter';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

const TODAY: string = DateUtil.todayInBrazil();
const MONTH: string = TODAY.slice(0, 7);
const SNAPSHOT_COMPANY_TYPE: string = 'portfolio-watch.monthly-snapshot.company.requested';

interface SnapshotRow {
    readonly assetId: string;
    readonly holdingKind: string;
    readonly quantity: string | null;
    readonly price: string | null;
    readonly valueMinor: string;
    readonly currency: string;
}

describe('foto mensal da carteira e livro de proventos', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('portfolio_watch', publisher);
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
        assetIds = await seedPrototypeAssets(harness);
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        await harness.stop();
    });

    beforeEach(() => {
        publisher.published.length = 0;
    });

    async function snapshot(account: Account): Promise<number> {
        const application: PortfolioWatchSnapshotApplication = harness.app.get(PortfolioWatchSnapshotApplication, { strict: false });
        return harness.inCompany(account.company.id, async () => application.snapshotCompany(account.company.id));
    }

    async function rowsOf(account: Account): Promise<SnapshotRow[]> {
        const result = await harness.pg.query<SnapshotRow>(
            `SELECT "assetId", "holdingKind", "quantity", "price", "valueMinor", "currency" FROM "PortfolioMonthlySnapshots" WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY "assetId"`,
            [account.company.id]
        );
        return result.rows;
    }

    async function addPosition(account: Account, symbol: string, quantity: string): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/positions', { assetId: assetIds[symbol], quantity });
        expect(response.status).toBe(201);
    }

    async function addTitle(account: Account): Promise<string> {
        const created = await harness.call<{ id: string }>(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB Banco',
            indexer: 'cdi_percent',
            rateBps: 11000,
            appliedMinor: 10_000_000,
            appliedAt: addDays(TODAY, -540),
            maturityDate: addDays(TODAY, 900)
        });
        expect(created.status).toBe(201);
        return created.body.id;
    }

    async function record(account: Account, eventId: string, assetId: string): Promise<boolean> {
        const service: PortfolioIncomeLedgerService = harness.app.get(PortfolioIncomeLedgerService, { strict: false });
        return harness.inCompany(account.company.id, async () =>
            service.recordEvent(account.company.id, {
                eventId,
                assetId,
                amountPerUnit: '0.78',
                currency: 'BRL',
                paymentDate: addDays(TODAY, 10)
            })
        );
    }

    it('grava a carteira de cada conta no mês, com a renda fixa pelo valor projetado, e refazer o mês não duplica', async () => {
        const first: Account = await harness.signUp('snap-a');
        const second: Account = await harness.signUp('snap-b');
        await addPrototypePositions(harness, first, assetIds);
        const titleId: string = await addTitle(first);
        await addPosition(second, 'ITUB4', '10');

        const written: number = await snapshot(first);
        await snapshot(second);
        const rows: SnapshotRow[] = await rowsOf(first);
        await snapshot(first);
        const again: SnapshotRow[] = await rowsOf(first);

        expect(written).toBe(rows.length);
        expect(again).toEqual(rows);
        const title: SnapshotRow | undefined = rows.find((row: SnapshotRow) => row.assetId === titleId);
        expect(title).toMatchObject({ holdingKind: 'fixed_income', quantity: null, currency: 'BRL' });
        expect(Number(title?.valueMinor)).toBeGreaterThan(10_000_000);
        const itub: SnapshotRow | undefined = rows.find((row: SnapshotRow) => row.assetId === assetIds['ITUB4']);
        expect(itub).toMatchObject({ holdingKind: 'position', quantity: '2000.0000000000', valueMinor: '7560000' });
        const other: SnapshotRow[] = await rowsOf(second);
        expect(other).toHaveLength(1);
        expect(other[0]).toMatchObject({ assetId: assetIds['ITUB4'], valueMinor: '37800' });
    });

    it('refazer o mês depois de a carteira mudar sobrescreve a foto do mês, sem deixar o que saiu', async () => {
        const account: Account = await harness.signUp('snap-redo');
        await addPosition(account, 'ITUB4', '10');
        await addPosition(account, 'VOO', '1');
        await snapshot(account);
        await harness.pg.query(`UPDATE "Positions" SET "deletedAt" = now() WHERE "companyId" = $1 AND "assetId" = $2`, [
            account.company.id,
            assetIds['VOO']
        ]);

        await snapshot(account);

        expect((await rowsOf(account)).map((row: SnapshotRow) => row.assetId)).toEqual([assetIds['ITUB4']]);
    });

    it('conta sem carteira não grava foto', async () => {
        const empty: Account = await harness.signUp('snap-empty');

        expect(await snapshot(empty)).toBe(0);
        expect(await rowsOf(empty)).toEqual([]);
    });

    it('a varredura do mês pede uma foto por conta com carteira, com o mês no jobId, e só dessas', async () => {
        const holder: Account = await harness.signUp('fan-a');
        const titleOnly: Account = await harness.signUp('fan-b');
        const nobody: Account = await harness.signUp('fan-c');
        await addPosition(holder, 'ITUB4', '10');
        await addTitle(titleOnly);
        const application: PortfolioWatchSnapshotApplication = harness.app.get(PortfolioWatchSnapshotApplication, { strict: false });

        await application.fanOutMonthly();

        const asked: string[] = publisher.ofType(SNAPSHOT_COMPANY_TYPE).map((message) => message.options?.jobId ?? '');
        expect(asked).toContain(`portfolio-watch-snapshot-${holder.company.id}-${MONTH}`);
        expect(asked).toContain(`portfolio-watch-snapshot-${titleOnly.company.id}-${MONTH}`);
        expect(asked.some((jobId: string) => jobId.includes(nobody.company.id))).toBe(false);
    });

    it('guarda 36 meses de fotos: a mais antiga sai quando o mês novo entra', async () => {
        const account: Account = await harness.signUp('snap-retention');
        await addPosition(account, 'ITUB4', '10');
        const old: { readonly month: string }[] = [{ month: '2020-01' }, { month: '2024-01' }];
        for (const item of old) {
            await harness.pg.query(
                `INSERT INTO "PortfolioMonthlySnapshots" ("id","companyId","month","assetId","holdingKind","valueMinor","currency") VALUES ($1,$2,$3,$4,'position',1,'BRL')`,
                [crypto.randomUUID(), account.company.id, item.month, assetIds['ITUB4']]
            );
        }

        await snapshot(account);

        const months = await harness.pg.query<{ month: string }>(
            `SELECT "month" FROM "PortfolioMonthlySnapshots" WHERE "companyId" = $1 ORDER BY "month"`,
            [account.company.id]
        );
        expect(months.rows.map((row) => row.month)).toEqual(['2024-01', MONTH]);
    });

    it('o livro grava o direito da conta na data-com, uma vez por evento, e ignora quem não tem o ativo', async () => {
        const holder: Account = await harness.signUp('led-a');
        const stranger: Account = await harness.signUp('led-b');
        await addPosition(holder, 'ITUB4', '100');
        const eventId: string = crypto.randomUUID();

        const first: boolean = await record(holder, eventId, assetIds['ITUB4'] as string);
        const second: boolean = await record(holder, eventId, assetIds['ITUB4'] as string);
        const none: boolean = await record(stranger, eventId, assetIds['ITUB4'] as string);

        expect([first, second, none]).toEqual([true, false, false]);
        const rows = await harness.pg.query<{ companyId: string; quantityAtExDate: string; amountMinor: string; paymentDate: Date }>(
            `SELECT "companyId", "quantityAtExDate", "amountMinor", "paymentDate" FROM "PortfolioIncomeLedger" WHERE "eventId" = $1`,
            [eventId]
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({ companyId: holder.company.id, quantityAtExDate: '100.0000000000', amountMinor: '7800' });
    });

    it('data-com com posição zerada não grava', async () => {
        const account: Account = await harness.signUp('led-zero');
        await addPosition(account, 'VOO', '0');

        expect(await record(account, crypto.randomUUID(), assetIds['VOO'] as string)).toBe(false);
    });

    it('a exportação traz as fotos e o livro da conta, e a exclusão da conta apaga tudo', async () => {
        const account: Account = await harness.signUp('exp');
        await addPosition(account, 'ITUB4', '100');
        await snapshot(account);
        await record(account, crypto.randomUUID(), assetIds['ITUB4'] as string);
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        const sections: Record<string, unknown> = await harness.inCompany(account.company.id, async () =>
            registry.exportSections(account.company.id)
        );
        const exported = sections['portfolio-watch'] as PortfolioWatchExport;
        await harness.inCompany(account.company.id, async () => registry.eraseAll(account.company.id));

        expect(exported.monthlySnapshots).toHaveLength(1);
        expect(exported.monthlySnapshots[0]).toMatchObject({ month: MONTH, assetId: assetIds['ITUB4'], valueMinor: 378_000 });
        expect(exported.incomeLedger).toHaveLength(1);
        const left = await harness.pg.query<{ total: string }>(
            `SELECT (SELECT count(*) FROM "PortfolioMonthlySnapshots" WHERE "companyId" = $1) + (SELECT count(*) FROM "PortfolioIncomeLedger" WHERE "companyId" = $1) AS total`,
            [account.company.id]
        );
        expect(Number(left.rows[0]?.total)).toBe(0);
    });
});
