import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account, AllocationHarness } from './support/allocation-harness';

interface ItemBody {
    readonly id: string;
    readonly name: string;
    readonly groupId: string;
    readonly groupName: string;
    readonly kind: string;
    readonly fgcAssociated: boolean;
    readonly status: string;
}

interface SearchBody {
    readonly items: ItemBody[];
}

interface ProblemBody {
    readonly type: string;
}

const SEARCHES_PER_MINUTE: number = 120;

describe('issuers search', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('issuers');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('exige sessão', async () => {
        const response = await harness.call(null, 'GET', '/issuers?q=inter');

        expect(response.status).toBe(401);
    });

    it('acha Banco Inter com o conglomerado Inter&Co ao buscar inter entre os bancos', async () => {
        const account: Account = await harness.signUp('issuers-inter');

        const response = await harness.call<SearchBody>(account.token, 'GET', '/issuers?q=inter&kind=bank');

        expect(response.status).toBe(200);
        expect(response.body.items[0]).toEqual({
            id: 'banco-inter',
            name: 'Banco Inter',
            groupId: 'inter-co',
            groupName: 'Inter&Co',
            kind: 'bank',
            fgcAssociated: true,
            status: 'active'
        });
    });

    it('ignora acento e caixa, acha pelo nome do conglomerado e separa banco de empresa', async () => {
        const account: Account = await harness.signUp('issuers-kinds');

        const accent = await harness.call<SearchBody>(account.token, 'GET', `/issuers?q=${encodeURIComponent('ITAÚ')}&kind=bank`);
        const group = await harness.call<SearchBody>(account.token, 'GET', '/issuers?q=pactual&kind=bank');
        const company = await harness.call<SearchBody>(account.token, 'GET', '/issuers?q=petro&kind=company');
        const wrongKind = await harness.call<SearchBody>(account.token, 'GET', '/issuers?q=petro&kind=bank');

        expect(accent.body.items.map((item: ItemBody) => item.id)).toEqual(['itau-unibanco']);
        expect(group.body.items.map((item: ItemBody) => item.id)).toEqual(expect.arrayContaining(['btg-pactual', 'banco-pan']));
        expect(company.body.items.map((item: ItemBody) => item.id)).toEqual(['petrobras']);
        expect(wrongKind.body.items).toEqual([]);
    });

    it('sem texto lista no máximo 20 e recusa kind inválido', async () => {
        const account: Account = await harness.signUp('issuers-limit');

        const listed = await harness.call<SearchBody>(account.token, 'GET', '/issuers');
        const invalid = await harness.call<ProblemBody>(account.token, 'GET', '/issuers?kind=sovereign');

        expect(listed.body.items).toHaveLength(20);
        expect(invalid.status).toBe(400);
    });

    it('limita a 120 buscas por minuto por company: a 121ª recebe 429', async () => {
        const account: Account = await harness.signUp('issuers-rate');
        const other: Account = await harness.signUp('issuers-rate-other');

        let blocked: number = 0;
        for (let call: number = 0; call < SEARCHES_PER_MINUTE; call++) {
            blocked += (await harness.call(account.token, 'GET', '/issuers?q=a')).status === 200 ? 0 : 1;
        }

        expect(blocked).toBe(0);
        expect((await harness.call(account.token, 'GET', '/issuers?q=a')).status).toBe(429);
        expect((await harness.call(other.token, 'GET', '/issuers?q=a')).status).toBe(200);
    });
});
