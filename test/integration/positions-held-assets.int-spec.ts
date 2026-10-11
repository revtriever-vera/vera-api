import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HeldAssetsService } from '../../src/modules/positions/services/held-assets.service';
import { Account, AllocationHarness } from './support/allocation-harness';

interface PositionBody {
    readonly id: string;
}

describe('positions held assets', () => {
    let harness: AllocationHarness;
    let service: HeldAssetsService;
    const assetIds: string[] = [];

    beforeAll(async () => {
        harness = await AllocationHarness.start('positions_held');
        service = harness.app.get(HeldAssetsService, { strict: false });
        for (const symbol of ['HELD1', 'HELD2', 'HELD3']) {
            const id: string = crypto.randomUUID();
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
                 VALUES ($1,'B3',$2,$2,$2,'stock','acoes_br','acoes_br','BRL','brapi',0)`,
                [id, symbol]
            );
            assetIds.push(id);
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function add(account: Account, assetId: string, quantity: string): Promise<string> {
        const response = await harness.call<PositionBody>(account.token, 'POST', '/positions', { assetId, quantity });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    it('junta os ativos de duas companies sem repetir o id, inclui quantidade zero e ignora removidas', async () => {
        const a: Account = await harness.signUp('held-a');
        const b: Account = await harness.signUp('held-b');
        await add(a, assetIds[0] as string, '10');
        await add(b, assetIds[0] as string, '3');
        await add(b, assetIds[1] as string, '0');
        const removed: string = await add(a, assetIds[2] as string, '5');
        await harness.call(a.token, 'DELETE', `/positions/${removed}`);

        const held: readonly string[] = await service.listHeldAssetIdsAcrossTenants();

        expect([...held].sort()).toEqual([assetIds[0] as string, assetIds[1] as string].sort());
    });
});
