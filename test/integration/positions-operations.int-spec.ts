import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InvestmentOperation, OperationInput, OperationKind } from '../../src/modules/positions/domain/investment-operations.types';
import { PositionOperationsService } from '../../src/modules/positions/services/position-operations.service';
import { Account, AllocationHarness } from './support/allocation-harness';

interface ExportBody {
    readonly sections: {
        readonly 'investment-operations'?: {
            readonly imports: { readonly fileName: string; readonly status: string }[];
            readonly operations: { readonly symbol: string | null; readonly kind: string; readonly tradeDate: string }[];
        };
    };
}

interface PositionRow {
    readonly quantity: string;
    readonly averagePrice: string | null;
}

describe('positions operations', () => {
    let harness: AllocationHarness;
    let service: PositionOperationsService;
    const assetIds: Record<string, string> = {};

    beforeAll(async () => {
        harness = await AllocationHarness.start('positions_operations');
        service = harness.app.get(PositionOperationsService, { strict: false });
        for (const symbol of ['ITUB4', 'WEGE3', 'HGLG11']) {
            const id: string = crypto.randomUUID();
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
                 VALUES ($1,'B3',$2,$2,$2,'stock','acoes_br','acoes_br','BRL','brapi',6)`,
                [id, symbol]
            );
            assetIds[symbol] = id;
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    function operation(
        symbol: string,
        kind: OperationKind,
        quantity: string,
        unitPrice: string,
        extra: Partial<OperationInput> = {}
    ): OperationInput {
        return {
            assetId: assetIds[symbol] ?? '',
            kind,
            incomeKind: kind === 'income' ? 'dividend' : null,
            tradeDate: '2026-03-10',
            settlementDate: null,
            lineNumber: 1,
            quantity,
            unitPrice,
            grossMinor: 0,
            feesMinor: 0,
            withheldTaxMinor: null,
            currency: 'BRL',
            fxRate: null,
            grossBrlMinor: null,
            dayTrade: false,
            sourceRef: `${symbol}:${kind}:${quantity}:${String(extra.lineNumber ?? 1)}`,
            ...extra
        };
    }

    async function positionOf(account: Account, symbol: string): Promise<PositionRow | null> {
        const result = await harness.pg.query<PositionRow>(
            `SELECT "quantity", "averagePrice" FROM "Positions" WHERE "companyId" = $1 AND "assetId" = $2 AND "deletedAt" IS NULL`,
            [account.company.id, assetIds[symbol]]
        );
        return result.rows[0] ?? null;
    }

    async function seedPosition(account: Account, symbol: string, quantity: string, averagePrice: string): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/positions', { assetId: assetIds[symbol], quantity, averagePrice });
        expect(response.status).toBe(201);
    }

    async function run<T>(account: Account, fn: () => Promise<T>): Promise<T> {
        return harness.inCompany(account.company.id, fn);
    }

    async function importOf(account: Account, name: string): Promise<string> {
        return run(
            account,
            async () =>
                (
                    await service.createImport({
                        createdBy: account.user.id,
                        source: 'b3',
                        fileSha256: name,
                        fileName: `/tmp/${name}.pdf`,
                        noteNumbers: ['1']
                    })
                ).id
        );
    }

    it('apply and undo bring the positions back, cent by cent', async () => {
        const account: Account = await harness.signUp('undo');
        await seedPosition(account, 'ITUB4', '10', '20');
        const importId: string = await importOf(account, 'one');
        const operations: OperationInput[] = [
            operation('ITUB4', 'buy', '10', '30', { feesMinor: 150 }),
            operation('ITUB4', 'sell', '5', '40', { lineNumber: 2 }),
            operation('WEGE3', 'buy', '3', '10.5', { feesMinor: 33 }),
            operation('HGLG11', 'income', '0', '1.2')
        ];

        const preview = await run(account, async () => service.preview(null, operations));
        expect(preview.find((effect) => effect.assetId === assetIds['ITUB4'])).toEqual({
            assetId: assetIds['ITUB4'],
            before: { quantity: '10', averagePrice: '20' },
            after: { quantity: '15', averagePrice: '25.075' }
        });
        expect(await positionOf(account, 'WEGE3')).toBeNull();

        const result = await run(account, async () => service.apply(importId, null, operations));

        expect(result.applied).toBe(4);
        expect(await positionOf(account, 'ITUB4')).toMatchObject({ quantity: '15.0000000000', averagePrice: '25.07500000' });
        expect(await positionOf(account, 'WEGE3')).toMatchObject({ quantity: '3.0000000000', averagePrice: '10.61000000' });
        expect(await positionOf(account, 'HGLG11')).toBeNull();

        await run(account, async () => service.undo(importId));

        expect(await positionOf(account, 'ITUB4')).toMatchObject({ quantity: '10.0000000000', averagePrice: '20.00000000' });
        expect(await positionOf(account, 'WEGE3')).toBeNull();
        const rows = await harness.pg.query<{ deletedAt: Date | null }>(
            `SELECT "deletedAt" FROM "InvestmentOperations" WHERE "importId" = $1`,
            [importId]
        );
        expect(rows.rows).toHaveLength(4);
        expect(rows.rows.every((row) => row.deletedAt !== null)).toBe(true);
    });

    it('a full sale removes the position and undo recreates it with its class', async () => {
        const account: Account = await harness.signUp('full-sale');
        await seedPosition(account, 'ITUB4', '7', '12.34');
        const importId: string = await importOf(account, 'sale');

        await run(account, async () => service.apply(importId, null, [operation('ITUB4', 'sell', '7', '15')]));
        expect(await positionOf(account, 'ITUB4')).toBeNull();

        await run(account, async () => service.undo(importId));
        expect(await positionOf(account, 'ITUB4')).toMatchObject({ quantity: '7.0000000000', averagePrice: '12.34000000' });
        const exported = await harness.call<{ sections: { positions: { classId: string | null }[] } }>(
            account.token,
            'GET',
            '/account/export'
        );
        expect(exported.body.sections.positions.map((position) => position.classId)).toEqual([expect.any(String)]);
    });

    it('the same operation twice does not duplicate and is not applied again', async () => {
        const account: Account = await harness.signUp('dup');
        const operations: OperationInput[] = [operation('ITUB4', 'buy', '10', '10')];
        const first: string = await importOf(account, 'dup-1');
        const second: string = await importOf(account, 'dup-2');

        await run(account, async () => service.apply(first, null, operations));
        const again = await run(account, async () => service.apply(second, null, [...operations, ...operations]));

        expect(again.applied).toBe(0);
        expect(again.skippedDuplicates).toBe(2);
        expect(await positionOf(account, 'ITUB4')).toMatchObject({ quantity: '10.0000000000' });
    });

    it('blocks undo while a later import touches the same asset', async () => {
        const account: Account = await harness.signUp('later');
        const first: string = await importOf(account, 'later-1');
        const second: string = await importOf(account, 'later-2');
        await run(account, async () => service.apply(first, null, [operation('ITUB4', 'buy', '10', '10')]));
        await run(account, async () => service.apply(second, null, [operation('ITUB4', 'buy', '5', '16', { sourceRef: 'other' })]));

        await expect(run(account, async () => service.undo(first))).rejects.toMatchObject({
            code: 'positions.undo_blocked_by_later_import'
        });

        await run(account, async () => service.undo(second));
        await run(account, async () => service.undo(first));
        expect(await positionOf(account, 'ITUB4')).toBeNull();
        await expect(run(account, async () => service.undo(first))).rejects.toMatchObject({ code: 'positions.import_not_open' });
    });

    it('refuses a sale larger than the position and writes nothing', async () => {
        const account: Account = await harness.signUp('exceeds');
        await seedPosition(account, 'ITUB4', '5', '10');
        const importId: string = await importOf(account, 'exceeds');

        await expect(
            run(account, async () =>
                service.apply(importId, null, [
                    operation('WEGE3', 'buy', '1', '1'),
                    operation('ITUB4', 'sell', '6', '10', { lineNumber: 2 })
                ])
            )
        ).rejects.toMatchObject({ code: 'positions.sell_exceeds_position', meta: { lineNumber: 2 } });

        expect(await positionOf(account, 'WEGE3')).toBeNull();
        expect(await positionOf(account, 'ITUB4')).toMatchObject({ quantity: '5.0000000000' });
    });

    it('refuses to undo when the position was edited after the import', async () => {
        const account: Account = await harness.signUp('edited');
        const importId: string = await importOf(account, 'edited');
        await run(account, async () => service.apply(importId, null, [operation('ITUB4', 'buy', '10', '10')]));
        await harness.pg.query(`UPDATE "Positions" SET "quantity" = 99 WHERE "companyId" = $1`, [account.company.id]);

        await expect(run(account, async () => service.undo(importId))).rejects.toMatchObject({ code: 'positions.changed_since_import' });
    });

    it('keeps two companies isolated and exports only the own operations', async () => {
        const a: Account = await harness.signUp('iso-a');
        const b: Account = await harness.signUp('iso-b');
        const operations: OperationInput[] = [
            operation('WEGE3', 'buy', '4', '10'),
            operation('WEGE3', 'income', '0', '1', { lineNumber: 2 })
        ];
        await run(a, async () => service.apply(await importOf(a, 'iso'), null, operations));
        await run(b, async () => service.apply(await importOf(b, 'iso'), null, [operation('ITUB4', 'buy', '1', '1')]));

        const response = await harness.call<ExportBody>(a.token, 'GET', '/account/export');

        const section = response.body.sections['investment-operations'];
        expect(section?.imports.map((row) => row.fileName)).toEqual(['iso.pdf']);
        expect(section?.operations.map((row) => `${row.symbol ?? ''}:${row.kind}`)).toEqual(['WEGE3:buy', 'WEGE3:income']);
        expect(await positionOf(a, 'ITUB4')).toBeNull();
        const stored = await harness.pg.query<Pick<InvestmentOperation, 'appliedToPosition'>>(
            `SELECT "appliedToPosition" FROM "InvestmentOperations" WHERE "companyId" = $1 ORDER BY "lineNumber"`,
            [a.company.id]
        );
        expect(stored.rows.map((row) => row.appliedToPosition)).toEqual([true, false]);
    });
});
