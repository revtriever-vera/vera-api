import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole } from '../../support/as-role';
import { Account, AllocationHarness } from '../support/allocation-harness';

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly required?: string };
}

interface MeBody {
    readonly role: string;
}

const EDITOR_WRITES: readonly [string, string][] = [
    ['POST', '/positions'],
    ['PATCH', '/spending/transactions/00000000-0000-4000-8000-000000000001'],
    ['PUT', '/allocation/settings'],
    ['POST', '/spending/imports'],
    ['PATCH', '/account/modules']
];

const OWNER_ONLY: readonly [string, string][] = [
    ['PUT', '/spending/connections/credentials'],
    ['DELETE', '/account'],
    ['GET', '/account/export']
];

describe('papéis Dono, Editor e Leitura', () => {
    let harness: AllocationHarness;
    let owner: Account;
    let editor: Account;
    let viewer: Account;

    beforeAll(async () => {
        harness = await AllocationHarness.start('roles');
        owner = await harness.signUp('roles');
        editor = await asRole(harness, owner, 'editor');
        viewer = await asRole(harness, owner, 'viewer');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('Leitura lê, e recebe 403 com o papel exigido em toda escrita', async () => {
        expect((await harness.call(viewer.token, 'GET', '/portfolio/overview')).status).toBe(200);

        for (const [method, path] of EDITOR_WRITES) {
            const response = await harness.call<ProblemBody>(viewer.token, method, path, {});
            expect(response.status, `${method} ${path}`).toBe(403);
            expect(response.body.type).toBe('members.forbidden_role');
            expect(response.body.meta?.required).toBe('editor');
        }
    });

    it('Editor passa pelo guard nas escritas e recebe 403 nas rotas só do Dono', async () => {
        for (const [method, path] of EDITOR_WRITES) {
            expect((await harness.call(editor.token, method, path, {})).status, `${method} ${path}`).not.toBe(403);
        }
        for (const [method, path] of OWNER_ONLY) {
            const response = await harness.call<ProblemBody>(editor.token, method, path, method === 'GET' ? undefined : {});
            expect(response.status, `${method} ${path}`).toBe(403);
            expect(response.body.meta?.required).toBe('owner');
        }
    });

    it('o Dono passa pelo guard em tudo, e exporta a conta', async () => {
        const writes: readonly [string, string][] = [...EDITOR_WRITES, ['PUT', '/spending/connections/credentials']];
        for (const [method, path] of writes) {
            expect((await harness.call(owner.token, method, path, {})).status, `${method} ${path}`).not.toBe(403);
        }
        expect((await harness.call(owner.token, 'GET', '/account/export')).status).toBe(200);
    });

    it('GET /auth/me devolve o papel', async () => {
        expect((await harness.call<MeBody>(viewer.token, 'GET', '/auth/me')).body.role).toBe('viewer');
        expect((await harness.call<MeBody>(editor.token, 'GET', '/auth/me')).body.role).toBe('editor');
        expect((await harness.call<MeBody>(owner.token, 'GET', '/auth/me')).body.role).toBe('owner');
    });

    it('a Leitura segue podendo salvar as próprias preferências', async () => {
        const response = await harness.call(viewer.token, 'PATCH', '/auth/me/preferences', { locale: null });

        expect(response.status).toBe(200);
    });

    it('a sugestão de aporte, que só calcula, não exige Editor', async () => {
        expect((await harness.call(viewer.token, 'POST', '/portfolio/contributions/suggest', {})).status).not.toBe(403);
    });

    it('rebaixar o Editor no banco vale na próxima chamada, sem esperar o token expirar', async () => {
        const demoted: Account = await asRole(harness, owner, 'editor');
        expect((await harness.call(demoted.token, 'POST', '/positions', {})).status).not.toBe(403);

        await harness.pg.query(`UPDATE "Users" SET "role" = 'viewer' WHERE "id" = $1`, [demoted.user.id]);

        expect((await harness.call(demoted.token, 'POST', '/positions', {})).status).toBe(403);
    });

    it('usuário removido recebe 401 na próxima chamada', async () => {
        const removed: Account = await asRole(harness, owner, 'viewer');
        expect((await harness.call(removed.token, 'GET', '/portfolio/overview')).status).toBe(200);

        await harness.pg.query(`UPDATE "Users" SET "deletedAt" = now() WHERE "id" = $1`, [removed.user.id]);

        expect((await harness.call(removed.token, 'GET', '/portfolio/overview')).status).toBe(401);
    });

    it('o papel numa company não vale em outra', async () => {
        const other: Account = await harness.signUp('roles-other');
        const otherViewer: Account = await asRole(harness, other, 'viewer');

        expect((await harness.call(otherViewer.token, 'POST', '/positions', {})).status).toBe(403);
        expect((await harness.call(other.token, 'POST', '/positions', {})).status).not.toBe(403);
        expect((await harness.call(editor.token, 'POST', '/positions', {})).status).not.toBe(403);
    });
});
