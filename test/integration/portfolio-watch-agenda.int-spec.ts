import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EnqueueMailRequest } from '../../src/core/mail/mailer.port';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { PortfolioWatchDailyApplication } from '../../src/modules/portfolio-watch/application/portfolio-watch-daily.application';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { seedAsset, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher, PublishedMessage } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

const TODAY: string = DateUtil.todayInBrazil();
const MAIL_MESSAGE: string = 'email.send.requested';
const DAILY_COMPANY_TYPE: string = 'portfolio-watch.daily.company.requested';

interface AgendaBody {
    readonly from: string;
    readonly to: string;
    readonly items: readonly {
        readonly id: string;
        readonly kind: string;
        readonly name: string;
        readonly date: string;
        readonly amountPerUnit: string | null;
        readonly amountForAccountMinor: number | null;
        readonly estimated: boolean;
        readonly documentUrl: string | null;
    }[];
}

interface ProblemBody {
    readonly type: string;
}

interface EntryBody {
    readonly type: string;
    readonly name: string;
}

describe('agenda da carteira e avisos por e-mail', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('portfolio_watch_agenda', publisher);
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

    async function seedStocks(...symbols: string[]): Promise<void> {
        for (const symbol of symbols) {
            assetIds[symbol] = await seedAsset(
                harness,
                {
                    symbol,
                    classKey: 'acoes_br',
                    market: 'B3',
                    typeGroup: 'acoes_br',
                    currency: 'BRL',
                    quantity: '1',
                    price: '10',
                    provider: 'brapi'
                },
                false
            );
        }
    }

    async function addPosition(account: Account, symbol: string, quantity: string, holderUserId?: string | null): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/positions', { assetId: assetIds[symbol], quantity, holderUserId });
        expect(response.status).toBe(201);
    }

    async function addTitle(account: Account, maturityDate: string, holderUserId?: string | null): Promise<string> {
        const response = await harness.call<{ id: string }>(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB Banco X',
            issuerId: 'banco-pan',
            indexer: 'prefixed',
            rateBps: 1200,
            appliedMinor: 1_000_000,
            appliedAt: addDays(TODAY, -30),
            maturityDate,
            holderUserId
        });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    async function addEvent(
        symbol: string,
        kind: string,
        dates: { exDate?: string; paymentDate?: string; eventDate?: string },
        amount: string | null
    ): Promise<string> {
        const id: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "PortfolioEvents" ("id","assetId","kind","exDate","paymentDate","eventDate","amountPerUnit","currency","source","externalKey","documentUrl")
             VALUES ($1,$2,$3,$4,$5,$6,$7,'BRL','fnet',$8,'https://fnet.example/doc')`,
            [id, assetIds[symbol], kind, dates.exDate ?? null, dates.paymentDate ?? null, dates.eventDate ?? null, amount, id]
        );
        return id;
    }

    async function evaluate(account: Account): Promise<number> {
        const application: PortfolioWatchDailyApplication = harness.app.get(PortfolioWatchDailyApplication, { strict: false });
        return harness.inCompany(account.company.id, async () => application.evaluate(account.company.id));
    }

    function mails(): EnqueueMailRequest[] {
        return publisher.ofType(MAIL_MESSAGE).map((message: PublishedMessage): EnqueueMailRequest => message.payload as EnqueueMailRequest);
    }

    function entriesOf(request: EnqueueMailRequest | undefined): EntryBody[] {
        return JSON.parse(request?.props['entries'] ?? '[]') as EntryBody[];
    }

    function tokenOf(request: EnqueueMailRequest, type: string): string {
        const urls: Record<string, string> = JSON.parse(request.props['unsubscribeUrls'] ?? '{}') as Record<string, string>;
        return (urls[type] ?? '').split('/notifications/unsubscribe/')[1] ?? '';
    }

    it('a agenda traz os eventos dos ativos da conta e os vencimentos, com o valor para a conta marcado como estimado, para o plano Free', async () => {
        await seedStocks('AGA0', 'AGB0');
        const owner: Account = await harness.signUp('agenda');
        await addPosition(owner, 'AGA0', '100');
        const titleId: string = await addTitle(owner, addDays(TODAY, 10));
        const income: string = await addEvent('AGA0', 'dividend', { exDate: addDays(TODAY, 2), paymentDate: addDays(TODAY, 20) }, '0.78');
        await addEvent('AGA0', 'dividend', { exDate: addDays(TODAY, 90) }, '1');
        await addEvent('AGB0', 'dividend', { exDate: addDays(TODAY, 2) }, '5');

        const response = await harness.call<AgendaBody>(
            owner.token,
            'GET',
            `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, 30)}`
        );

        expect(response.status).toBe(200);
        expect(response.body.items.map((item) => item.id)).toEqual([income, titleId]);
        expect(response.body.items[0]).toMatchObject({
            kind: 'dividend',
            name: 'AGA0',
            date: addDays(TODAY, 2),
            amountPerUnit: '0.78',
            amountForAccountMinor: 7800,
            estimated: true,
            documentUrl: 'https://fnet.example/doc'
        });
        expect(response.body.items[1]).toMatchObject({ kind: 'fixed_income_maturity', date: addDays(TODAY, 10), estimated: true });
        expect(response.body.items[1]?.amountForAccountMinor).toBeGreaterThan(1_000_000);
    });

    it('o pagamento dentro da janela aparece mesmo com a data-com antes dela', async () => {
        await seedStocks('AGA1', 'AGB1');
        const owner: Account = await harness.signUp('agenda-pay');
        await addPosition(owner, 'AGA1', '10');
        await addEvent('AGA1', 'fii_income', { exDate: addDays(TODAY, -20), paymentDate: addDays(TODAY, 5) }, '0.50');

        const response = await harness.call<AgendaBody>(
            owner.token,
            'GET',
            `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, 10)}`
        );

        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0]?.date).toBe(addDays(TODAY, 5));
    });

    it('conta isolada: a agenda de uma conta não mostra o ativo de outra', async () => {
        await seedStocks('AGA2', 'AGB2');
        const holder: Account = await harness.signUp('iso-a');
        const stranger: Account = await harness.signUp('iso-b');
        await addPosition(holder, 'AGA2', '10');
        await addEvent('AGA2', 'dividend', { exDate: addDays(TODAY, 2) }, '0.10');

        const mine = await harness.call<AgendaBody>(holder.token, 'GET', `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, 5)}`);
        const other = await harness.call<AgendaBody>(
            stranger.token,
            'GET',
            `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, 5)}`
        );

        expect(mine.body.items).toHaveLength(1);
        expect(other.body.items).toEqual([]);
    });

    it('com holder filtra a agenda pela pessoa, e o leitor também vê', async () => {
        await seedStocks('AGA3', 'AGB3');
        const owner: Account = await harness.signUp('holder');
        const ana: Account = await asRole(harness, owner, 'editor');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        await addPosition(owner, 'AGA3', '10', ana.user.id);
        await addPosition(owner, 'AGB3', '2', null);
        await addEvent('AGA3', 'dividend', { exDate: addDays(TODAY, 2) }, '0.10');
        await addEvent('AGB3', 'dividend', { exDate: addDays(TODAY, 3) }, '0.20');
        await addTitle(owner, addDays(TODAY, 4), ana.user.id);
        const path: string = `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, 10)}`;

        const forAna = await harness.call<AgendaBody>(viewer.token, 'GET', `${path}&holder=${ana.user.id}`);
        const forAll = await harness.call<AgendaBody>(owner.token, 'GET', `${path}&holder=all`);
        const any = await harness.call<AgendaBody>(owner.token, 'GET', path);

        expect(forAna.body.items.map((item) => item.name)).toEqual(['AGA3', 'CDB Banco X']);
        expect(forAll.body.items.map((item) => item.name)).toEqual(['AGB3']);
        expect(any.body.items).toHaveLength(3);
    });

    it('recusa janela invertida, longa demais ou data inválida, e exige login', async () => {
        const owner: Account = await harness.signUp('window');

        const inverted = await harness.call<ProblemBody>(
            owner.token,
            'GET',
            `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, -1)}`
        );
        const tooLong = await harness.call<ProblemBody>(
            owner.token,
            'GET',
            `/portfolio-watch/agenda?from=${TODAY}&to=${addDays(TODAY, 400)}`
        );
        const invalid = await harness.call<ProblemBody>(owner.token, 'GET', '/portfolio-watch/agenda?from=2026-13-45&to=2026-12-01');
        const anonymous = await harness.call<ProblemBody>(null, 'GET', `/portfolio-watch/agenda?from=${TODAY}&to=${TODAY}`);

        expect(inverted.status).toBe(400);
        expect(inverted.body.type).toBe('portfolio_watch.invalid_agenda_window');
        expect(tooLong.status).toBe(400);
        expect(invalid.status).toBe(400);
        expect(anonymous.status).toBe(401);
    });

    it('um e-mail por pessoa com todos os eventos do dia, rodar de novo não manda outro, e a conta sem o ativo não recebe', async () => {
        await seedStocks('AGA5', 'AGB5');
        const owner: Account = await harness.signUp('digest');
        const ana: Account = await asRole(harness, owner, 'editor');
        const stranger: Account = await harness.signUp('digest-other');
        await addPosition(owner, 'AGA5', '100');
        await addPosition(owner, 'AGB5', '3');
        await addTitle(owner, addDays(TODAY, 15));
        await addEvent('AGA5', 'dividend', { exDate: addDays(TODAY, 1), paymentDate: addDays(TODAY, 14) }, '0.78');
        await addEvent('AGB5', 'dividend', { exDate: addDays(TODAY, -10), paymentDate: TODAY }, '0.40');
        await addEvent('AGA5', 'assembly', { eventDate: addDays(TODAY, 3) }, null);
        await addEvent('AGA5', 'dividend', { exDate: addDays(TODAY, 7) }, '9');

        const first: number = await evaluate(owner);
        const sent: EnqueueMailRequest[] = mails();
        const second: number = await evaluate(owner);
        const none: number = await evaluate(stranger);

        expect(first).toBe(2);
        expect(sent).toHaveLength(2);
        expect(sent.map((request) => request.to.email).sort()).toEqual([ana.user.email, owner.user.email].sort());
        expect(sent[0]?.template).toBe('portfolio-watch-digest');
        expect(
            entriesOf(sent[0])
                .map((entry) => entry.type)
                .sort()
        ).toEqual(['fixed_income_maturity_soon', 'portfolio_assembly_soon', 'portfolio_ex_date_tomorrow', 'portfolio_payment_today']);
        expect(second).toBe(0);
        expect(none).toBe(0);
        expect(mails()).toHaveLength(2);
    });

    it('quem desligou um tipo não recebe aquele aviso, e o descadastro pelo link do tipo desliga só ele', async () => {
        await seedStocks('AGA6', 'AGB6');
        const owner: Account = await harness.signUp('optout');
        await addPosition(owner, 'AGA6', '100');
        await addEvent('AGA6', 'dividend', { exDate: addDays(TODAY, 1) }, '0.78');
        await addEvent('AGA6', 'assembly', { eventDate: addDays(TODAY, 3) }, null);
        const prefs = await harness.call(owner.token, 'PATCH', '/notifications/preferences', {
            type: 'portfolio_ex_date_tomorrow',
            enabled: false
        });

        await evaluate(owner);
        const first: EnqueueMailRequest[] = mails();
        const unsubscribed = await harness.call<{ type: string }>(
            null,
            'POST',
            `/notifications/unsubscribe/${tokenOf(first[0] as EnqueueMailRequest, 'portfolio_assembly_soon')}`
        );
        await harness.pg.query(`DELETE FROM "NoticeSends" WHERE "companyId" = $1`, [owner.company.id]);
        publisher.published.length = 0;
        await evaluate(owner);

        expect(prefs.status).toBe(200);
        expect(first).toHaveLength(1);
        expect(entriesOf(first[0]).map((entry) => entry.type)).toEqual(['portfolio_assembly_soon']);
        expect(unsubscribed).toEqual({ status: 200, body: { type: 'portfolio_assembly_soon' } });
        expect(mails()).toHaveLength(0);
    });

    it('a data-com de hoje entra no livro de proventos, uma vez', async () => {
        await seedStocks('AGA7', 'AGB7');
        const owner: Account = await harness.signUp('ledger');
        await addPosition(owner, 'AGA7', '100');
        const eventId: string = await addEvent('AGA7', 'dividend', { exDate: TODAY, paymentDate: addDays(TODAY, 10) }, '0.78');

        await evaluate(owner);
        await evaluate(owner);

        const rows = await harness.pg.query<{ amountMinor: string }>(
            `SELECT "amountMinor" FROM "PortfolioIncomeLedger" WHERE "eventId" = $1`,
            [eventId]
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]?.amountMinor).toBe('7800');
    });

    it('a varredura diária pede uma avaliação por conta com carteira, com o dia no jobId', async () => {
        await seedStocks('AGA8', 'AGB8');
        const holder: Account = await harness.signUp('fan-a');
        const titleOnly: Account = await harness.signUp('fan-b');
        const nobody: Account = await harness.signUp('fan-c');
        await addPosition(holder, 'AGA8', '10');
        await addTitle(titleOnly, addDays(TODAY, 300));
        const application: PortfolioWatchDailyApplication = harness.app.get(PortfolioWatchDailyApplication, { strict: false });

        await application.fanOutDaily();

        const asked: string[] = publisher.ofType(DAILY_COMPANY_TYPE).map((message) => message.options?.jobId ?? '');
        expect(asked).toContain(`portfolio-watch-daily-${holder.company.id}-${TODAY}`);
        expect(asked).toContain(`portfolio-watch-daily-${titleOnly.company.id}-${TODAY}`);
        expect(asked.some((jobId: string) => jobId.includes(nobody.company.id))).toBe(false);
    });
});
