import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account, AllocationHarness } from './support/allocation-harness';

interface LineBody {
    readonly lineId: string;
    readonly status: string;
    readonly reason: string | null;
    readonly kind: string | null;
    readonly ticker: string | null;
    readonly feesMinor: number | null;
}

interface PreviewBody {
    readonly previewId: string;
    readonly source: string;
    readonly operations: LineBody[];
    readonly notes: { readonly code: string; readonly count: number }[];
}

interface CommitBody {
    readonly applied: number;
}

const SAMPLES: string = join(__dirname, '..', 'fixtures', 'investment-import', 'generated', 'crypto');

describe('investment import of a crypto exchange CSV', () => {
    let harness: AllocationHarness;
    let origin: string;
    const assetIds: Record<string, string> = {};

    beforeAll(async () => {
        harness = await AllocationHarness.start('investment_import_crypto');
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        for (const [symbol, externalId] of [
            ['BTC', 'bitcoin'],
            ['ETH', 'ethereum']
        ] as const) {
            const id: string = crypto.randomUUID();
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals","rank")
                 VALUES ($1,'CRYPTO',$2,$3,$2,'crypto','cripto','cripto','USD','coingecko',8,1)`,
                [id, externalId, symbol]
            );
            assetIds[symbol] = id;
        }
        await harness.pg.query(
            `INSERT INTO "ExchangeRates" ("id","currency","date","brlPerUnit","source") VALUES ('${crypto.randomUUID()}','USD','2025-06-10',5.6,'ptax')`
        );
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function preview(account: Account, name: string): Promise<PreviewBody> {
        const form: FormData = new FormData();
        form.append('file', new Blob([new Uint8Array(readFileSync(join(SAMPLES, name)))]), name);
        const response: Response = await fetch(`${origin}/investment-imports/preview`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${account.token}` }
        });
        const body: unknown = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(200);
        return body as PreviewBody;
    }

    function lineOf(body: PreviewBody, ticker: string, kind: string): LineBody {
        const found: LineBody | undefined = body.operations.find((line: LineBody): boolean => line.ticker === ticker && line.kind === kind);
        if (found === undefined) {
            throw new Error(`missing ${ticker} ${kind}`);
        }
        return found;
    }

    async function quantityOf(account: Account, symbol: string): Promise<number | null> {
        const result = await harness.pg.query<{ quantity: string }>(
            `SELECT "quantity" FROM "Positions" WHERE "companyId" = $1 AND "assetId" = $2 AND "deletedAt" IS NULL`,
            [account.company.id, assetIds[symbol]]
        );
        const row = result.rows[0];
        return row === undefined ? null : Number(row.quantity);
    }

    it('resolves the assets by symbol, applies purchases and not transfers, and does not duplicate on a second import', async () => {
        const owner: Account = await harness.signUp('cripto');

        const ready: PreviewBody = await preview(owner, 'mercado-bitcoin.csv');

        expect(ready.source).toBe('crypto_csv');
        expect(lineOf(ready, 'BTC', 'buy')).toMatchObject({ status: 'ok', feesMinor: 0 });
        expect(lineOf(ready, 'ETH', 'sell')).toMatchObject({ status: 'blocked', reason: 'sell_exceeds_position', feesMinor: 1180 });
        expect(lineOf(ready, 'BTC', 'transfer').status).toBe('ok');
        expect(ready.notes).toContainEqual({ code: 'crypto_transfer_check', count: 2 });

        const sale: LineBody = lineOf(ready, 'ETH', 'sell');
        const done = await harness.call<CommitBody>(owner.token, 'POST', '/investment-imports', {
            previewId: ready.previewId,
            edits: [{ lineId: sale.lineId, skip: true }]
        });

        expect(done.status).toBe(201);
        expect(await quantityOf(owner, 'BTC')).toBeCloseTo(0.004995, 8);

        const again: PreviewBody = await preview(owner, 'mercado-bitcoin.csv');

        expect(lineOf(again, 'BTC', 'buy').status).toBe('duplicate');
        expect(lineOf(again, 'BTC', 'transfer').status).toBe('duplicate');
        expect(lineOf(again, 'ETH', 'income').status).toBe('duplicate');
    });

    it('answers asset_not_found for a symbol that the crypto catalog does not have', async () => {
        const owner: Account = await harness.signUp('cripto-sem-ativo');

        const ready: PreviewBody = await preview(owner, 'coinbase.csv');

        expect(lineOf(ready, 'SOL', 'buy')).toMatchObject({ status: 'blocked', reason: 'asset_not_found', feesMinor: 1260 });
        expect(lineOf(ready, 'BTC', 'buy').status).toBe('ok');
    });
});
