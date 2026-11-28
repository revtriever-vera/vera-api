import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { LogService } from '../../src/core/observability/log.service';
import { CalendarCreateEventTool, CalendarListEventsTool } from '../../src/modules/google-calendar/services/calendar-ask-vera.tools';
import { CalendarAccountEraser } from '../../src/modules/google-calendar/services/calendar-account.eraser';
import { CalendarCreateExecutor } from '../../src/modules/google-calendar/services/calendar-pending-actions';
import { CalendarMemberLifecycle } from '../../src/modules/google-calendar/services/calendar-member.lifecycle';
import { CalendarStateService } from '../../src/modules/google-calendar/services/calendar-state.service';
import { CalendarVaultService } from '../../src/modules/google-calendar/services/calendar-vault.service';
import { MockCalendarAdapter } from '../../src/modules/google-calendar/drivers/mock-calendar.adapter';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { User } from '../../src/modules/identity/domain/identity.types';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { PremiumLifecycleRegistry } from '../../src/modules/plans/services/premium-lifecycle.registry';
import { Account, AllocationHarness } from './support/allocation-harness';

interface ConnectionRow {
    readonly id: string;
    readonly userId: string;
    readonly status: string;
    readonly googleEmail: string;
    readonly refreshTokenSealed: string | null;
    readonly scopes: string[];
}

interface ViewBody {
    readonly status: string;
    readonly email: string | null;
    readonly access: string | null;
}

interface EventsBody {
    readonly items: readonly { readonly id: string; readonly title: string; readonly byVera: boolean }[];
}

const APP_URL: string = 'http://localhost:5173';
const SOON: string = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

describe('Google Agenda (driver mock, hospedada)', () => {
    let harness: AllocationHarness;
    let mock: MockCalendarAdapter;
    let vault: CalendarVaultService;
    let states: CalendarStateService;
    const logged: string[] = [];

    async function premium(account: Account): Promise<Account> {
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        return account;
    }

    async function asPerson<T>(account: Account, fn: () => Promise<T>): Promise<T> {
        return harness.app
            .get(AppContext)
            .run({ requestId: 'int-person', companyId: account.company.id, userId: account.user.id, locale: 'pt-BR' }, fn);
    }

    async function startFlow(account: Account): Promise<{ url: URL; state: string }> {
        const response = await harness.call<{ url: string }>(account.token, 'GET', '/calendar/google/start');
        expect(response.status).toBe(200);
        const url: URL = new URL(response.body.url);
        return { url, state: url.searchParams.get('state') as string };
    }

    async function callback(state: string, code: string): Promise<string> {
        const response = await harness.callRedirect(
            `/calendar/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
        );
        expect(response.status).toBe(302);
        return response.location as string;
    }

    async function connect(account: Account, code: string = 'mock:ana@exemplo.test'): Promise<string> {
        const { state } = await startFlow(account);
        return callback(state, code);
    }

    async function connectionOf(account: Account, status?: string): Promise<ConnectionRow | undefined> {
        const rows = await harness.pg.query<ConnectionRow>(
            `SELECT "id","userId","status","googleEmail","refreshTokenSealed","scopes" FROM "CalendarConnections" WHERE "userId" = $1 ${status === undefined ? '' : 'AND "status" = $2'} ORDER BY "createdAt" DESC`,
            status === undefined ? [account.user.id] : [account.user.id, status]
        );
        return rows.rows[0];
    }

    async function tokenOf(account: Account): Promise<string> {
        const row: ConnectionRow = (await connectionOf(account, 'active')) as ConnectionRow;
        return (await harness.inCompany(account.company.id, async () => vault.open(row.refreshTokenSealed as string))) as string;
    }

    function inHours(hours: number): string {
        return new Date(Date.now() + hours * 3_600_000).toISOString();
    }

    async function propose(account: Account, input: Record<string, unknown>) {
        const tool: CalendarCreateEventTool = harness.app.get(CalendarCreateEventTool, { strict: false });
        return asPerson(account, async () => tool.run(input));
    }

    async function member(account: Account, label: string): Promise<Account> {
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User = await harness.inCompany(account.company.id, async () =>
            users.createMember({
                email: `${label}-${crypto.randomUUID()}@example.com`,
                name: `Pessoa ${label}`,
                role: 'viewer',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await harness.inCompany(account.company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google', 'app')
        );
        return { company: account.company, user, token: tokens.accessToken };
    }

    beforeAll(async () => {
        harness = await AllocationHarness.start('google_calendar');
        mock = harness.app.get(MockCalendarAdapter, { strict: false });
        vault = harness.app.get(CalendarVaultService, { strict: false });
        states = harness.app.get(CalendarStateService, { strict: false });
        const logs: LogService = harness.app.get(LogService, { strict: false });
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
            const original = logs[level].bind(logs);
            vi.spyOn(logs, level).mockImplementation((entry) => {
                logged.push(JSON.stringify(entry));
                original(entry);
            });
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('free inicia a conexão da Agenda, que passou a ser do Free', async () => {
        const free: Account = await harness.signUp('cal-free');

        const response = await harness.call<{ url: string }>(free.token, 'GET', '/calendar/google/start');

        expect(response.status).toBe(200);
        expect(new URL(response.body.url).origin).toBe('https://accounts.google.com');
    });

    it('start devolve a URL com escopo, PKCE e o state guardado com o verifier', async () => {
        const account: Account = await premium(await harness.signUp('cal-start'));

        const { url, state } = await startFlow(account);

        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/calendar.events',
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: 'true',
            login_hint: account.user.email,
            code_challenge_method: 'S256'
        });
        const stored = await harness.pg.query<{ codeVerifier: string; usedAt: Date | null }>(
            'SELECT "codeVerifier","usedAt" FROM "CalendarOAuthStates" WHERE "userId" = $1',
            [account.user.id]
        );
        expect(stored.rows).toHaveLength(1);
        expect(
            createHash('sha256')
                .update(stored.rows[0]?.codeVerifier ?? '')
                .digest('base64url')
        ).toBe(url.searchParams.get('code_challenge'));
        expect(state.length).toBeGreaterThan(20);
    });

    it('callback com state válido conecta, sela o token e a aba mostra a conta', async () => {
        const account: Account = await premium(await harness.signUp('cal-connect'));

        const location: string = await connect(account);

        expect(location).toBe(`${APP_URL}/settings/calendar?connected=1`);
        const row: ConnectionRow = (await connectionOf(account)) as ConnectionRow;
        expect(row).toMatchObject({ status: 'active', googleEmail: 'ana@exemplo.test' });
        expect(row.refreshTokenSealed).not.toContain('mock-refresh');
        expect(await tokenOf(account)).toMatch(/^mock-refresh-/);
        const view = await harness.call<ViewBody>(account.token, 'GET', '/calendar/connection');
        expect(view.body).toMatchObject({ status: 'active', email: 'ana@exemplo.test', access: 'read_write' });
    });

    it('recusa o state reusado, o vencido, o de outra pessoa e o adulterado', async () => {
        const account: Account = await premium(await harness.signUp('cal-state'));
        const other: Account = await premium(await harness.signUp('cal-state-other'));
        const { state } = await startFlow(account);
        await callback(state, 'mock:ana@exemplo.test');

        expect(await callback(state, 'mock:ana@exemplo.test')).toBe(`${APP_URL}/settings/calendar?error=calendar.state_invalid`);

        const nonce: string = (
            await harness.pg.query<{ nonce: string }>('SELECT "nonce" FROM "CalendarOAuthStates" WHERE "userId" = $1', [account.user.id])
        ).rows[0]?.nonce as string;
        const forged: string = states.issue({ companyId: account.company.id, userId: other.user.id, nonce, hint: null }, new Date());
        expect(await callback(forged, 'mock:x@exemplo.test')).toBe(`${APP_URL}/settings/calendar?error=calendar.state_invalid`);
        const expired: string = states.issue(
            { companyId: account.company.id, userId: account.user.id, nonce, hint: null },
            new Date(Date.now() - 3_600_000)
        );
        expect(await callback(expired, 'mock:x@exemplo.test')).toBe(`${APP_URL}/settings/calendar?error=calendar.state_invalid`);
        expect(await callback('lixo', 'mock:x@exemplo.test')).toBe(`${APP_URL}/settings/calendar?error=calendar.state_invalid`);
        expect(await connectionOf(other)).toBeUndefined();
    });

    it('escopo negado e consentimento negado voltam com o código de erro e não conectam', async () => {
        const account: Account = await premium(await harness.signUp('cal-scope'));

        expect(await connect(account, 'mock::no_scope')).toBe(`${APP_URL}/settings/calendar?error=calendar.scope_missing`);
        expect(await connectionOf(account)).toBeUndefined();
        const denied = await harness.callRedirect('/calendar/google/callback?error=access_denied');
        expect(denied.location).toBe(`${APP_URL}/settings/calendar?error=calendar.consent_denied`);
    });

    it('a rota da auto-hospedada /google/callback cai no mesmo tratamento', async () => {
        const account: Account = await premium(await harness.signUp('cal-alias'));
        const { state } = await startFlow(account);

        const response = await harness.callRedirect(
            `/google/callback?code=${encodeURIComponent('mock:ana@exemplo.test')}&state=${encodeURIComponent(state)}`
        );

        expect(response.location).toBe(`${APP_URL}/settings/calendar?connected=1`);
    });

    it('lista os próximos compromissos marcando os da Vera, e cada pessoa vê só a própria agenda', async () => {
        const first: Account = await premium(await harness.signUp('cal-list'));
        const second: Account = await member(first, 'cal-list-2');
        await connect(first, 'mock:um@exemplo.test');
        await connect(second, 'mock:dois@exemplo.test');
        mock.seed(await tokenOf(first), { id: 'e1', title: 'Revisão da carteira', start: inHours(2), end: inHours(3), byVera: true });
        mock.seed(await tokenOf(first), { id: 'e2', title: 'Almoço', start: inHours(30), end: inHours(31) });
        mock.seed(await tokenOf(second), { id: 'e3', title: 'Reunião da segunda pessoa', start: inHours(5), end: inHours(6) });

        const mine = await harness.call<EventsBody>(first.token, 'GET', '/calendar/events');
        const theirs = await harness.call<EventsBody>(second.token, 'GET', '/calendar/events');

        expect(mine.status).toBe(200);
        expect(mine.body.items.map((item) => [item.id, item.byVera])).toEqual([
            ['e1', true],
            ['e2', false]
        ]);
        expect(theirs.body.items.map((item) => item.id)).toEqual(['e3']);
        const text: string = await asPerson(
            first,
            async () => ((await harness.app.get(CalendarListEventsTool, { strict: false }).run({})) as { text: string }).text
        );
        expect(text).toMatch(/^Seus próximos compromissos:\n• \p{L}{3} \d{2}\/\d{2}, \d{2}:\d{2}: Revisão da carteira\n• /u);
    });

    it('sem conexão a lista e a criação respondem not_connected com o texto do protótipo', async () => {
        const account: Account = await premium(await harness.signUp('cal-none'));

        const list = await asPerson(account, async () => harness.app.get(CalendarListEventsTool, { strict: false }).run({}));
        const create = await propose(account, { title: 'Call', start: `${SOON}T15:00` });
        const route = await harness.call<{ type: string }>(account.token, 'GET', '/calendar/events');

        expect((list as { text: string }).text).toContain('conecte o Google Agenda em Configurações › Google Agenda');
        expect(create.payload).toMatchObject({ status: 'not_connected' });
        expect(route.status).toBe(409);
        expect(route.body.type).toBe('calendar.not_connected');
    });

    it('a ferramenta de criar só propõe: não cria, pede horário vago e recusa o passado', async () => {
        const account: Account = await premium(await harness.signUp('cal-propose'));
        await connect(account);
        const before: number = mock.storedEvents().length;

        const proposed = await propose(account, { title: 'Revisão com a Ana', start: `${SOON}T15:00`, durationMinutes: 45 });
        const vague = await propose(account, { title: 'Revisão com a Ana' });
        const past = await propose(account, { title: 'Revisão com a Ana', start: '2020-01-01T10:00' });

        expect(proposed.proposal?.payload).toMatchObject({
            title: 'Revisão com a Ana',
            userId: account.user.id,
            timeZone: 'America/Sao_Paulo'
        });
        expect(proposed.proposal?.summary).toContain('Revisão com a Ana');
        expect(vague.payload).toMatchObject({ status: 'needs_time' });
        expect(past.payload).toMatchObject({ status: 'invalid', reason: 'past' });
        expect(mock.storedEvents()).toHaveLength(before);
    });

    it('confirmar cria uma vez: o duplo clique não duplica, cancelar não cria e outro dono não executa', async () => {
        const account: Account = await premium(await harness.signUp('cal-confirm'));
        const intruder: Account = await premium(await harness.signUp('cal-intruder'));
        await connect(account);
        const executor: CalendarCreateExecutor = harness.app.get(CalendarCreateExecutor, { strict: false });
        const proposal = (await propose(account, { title: 'Revisão com a Ana', start: `${SOON}T15:00` })).proposal;
        const payload = proposal?.payload as Record<string, never>;
        const before: number = mock.storedEvents().length;

        const first = await asPerson(account, async () => executor.execute(payload));
        const second = await asPerson(account, async () => executor.execute(payload));

        expect(first).toMatch(/^Reunião criada no Google Agenda: Revisão com a Ana, \p{L}{3} \d{2}\/\d{2} às 15:00\.$/u);
        expect(second).toBe(first);
        expect(mock.storedEvents()).toHaveLength(before + 1);
        expect(mock.storedEvents().at(-1)).toMatchObject({ title: 'Revisão com a Ana', byVera: true });
        const recorded = await harness.pg.query('SELECT 1 FROM "CalendarEventsCreated" WHERE "userId" = $1', [account.user.id]);
        expect(recorded.rows).toHaveLength(1);
        await expect(asPerson(intruder, async () => executor.execute(payload))).rejects.toThrow('proposal owner');
        expect(executor.canceledText('pt-BR')).toBe('Reunião não criada.');
        const events = await harness.call<EventsBody>(account.token, 'GET', '/calendar/events');
        expect(events.body.items.at(-1)).toMatchObject({ title: 'Revisão com a Ana', byVera: true });
    });

    it('conexão só leitura lista, mas a criação devolve read_only', async () => {
        const account: Account = await premium(await harness.signUp('cal-readonly'));
        await connect(account, 'mock:leitura@exemplo.test:read_only');

        const view = await harness.call<ViewBody>(account.token, 'GET', '/calendar/connection');
        const create = await propose(account, { title: 'Call', start: `${SOON}T15:00` });
        const list = await harness.call<EventsBody>(account.token, 'GET', '/calendar/events');

        expect(view.body).toMatchObject({ status: 'active', access: 'read_only' });
        expect(create.payload).toMatchObject({ status: 'read_only' });
        expect(list.status).toBe(200);
    });

    it('desconectar revoga no Google, apaga o token e conectar de novo troca a conexão', async () => {
        const account: Account = await premium(await harness.signUp('cal-disconnect'));
        await connect(account);
        const token: string = await tokenOf(account);

        const removed = await harness.call<null>(account.token, 'DELETE', '/calendar/connection');

        expect(removed.status).toBe(204);
        expect(mock.wasRevoked(token)).toBe(true);
        expect(await connectionOf(account)).toMatchObject({ status: 'disconnected', refreshTokenSealed: null });
        expect((await harness.call<ViewBody>(account.token, 'GET', '/calendar/connection')).body.status).toBe('none');
        await connect(account, 'mock:nova@exemplo.test');
        const second: string = await tokenOf(account);
        await connect(account, 'mock:outra@exemplo.test');
        expect(mock.wasRevoked(second)).toBe(true);
        const active = await harness.pg.query('SELECT 1 FROM "CalendarConnections" WHERE "userId" = $1 AND "status" = \'active\'', [
            account.user.id
        ]);
        expect(active.rows).toHaveLength(1);
    });

    it('token revogado pelo Google vira revoked, a aba avisa e as ferramentas devolvem not_connected', async () => {
        const account: Account = await premium(await harness.signUp('cal-revoked'));
        await connect(account);
        mock.invalidate(await tokenOf(account));

        const events = await harness.call<{ type: string }>(account.token, 'GET', '/calendar/events');
        const view = await harness.call<ViewBody>(account.token, 'GET', '/calendar/connection');
        const create = await propose(account, { title: 'Call', start: `${SOON}T15:00` });

        expect(events.status).toBe(409);
        expect(view.body).toMatchObject({ status: 'revoked' });
        expect((await connectionOf(account))?.refreshTokenSealed).toBeNull();
        expect(create.payload).toMatchObject({ status: 'not_connected' });
    });

    it('o fim do Premium e a saída de membro desconectam só os certos, e apagar a conta revoga tudo', async () => {
        const ended: Account = await premium(await harness.signUp('cal-ended'));
        const stays: Account = await premium(await harness.signUp('cal-stays'));
        const leaver: Account = await member(ended, 'cal-leaver');
        await connect(ended);
        await connect(leaver);
        await connect(stays);
        const registry: PremiumLifecycleRegistry = harness.app.get(PremiumLifecycleRegistry, { strict: false });

        await harness.inCompany(ended.company.id, async () =>
            harness.app.get(CalendarMemberLifecycle, { strict: false }).onMemberRemoved(leaver.user.id)
        );
        expect(await connectionOf(leaver, 'active')).toBeUndefined();
        expect(await connectionOf(ended, 'active')).toBeDefined();
        await harness.inCompany(ended.company.id, async () => registry.handlerNamed('calendar')?.onPremiumEnded());

        expect(await connectionOf(ended, 'active')).toBeUndefined();
        expect(await connectionOf(stays, 'active')).toBeDefined();
        const token: string = await tokenOf(stays);
        const erased: number = await harness.inCompany(stays.company.id, async () =>
            harness.app.get(CalendarAccountEraser, { strict: false }).eraseAll(stays.company.id)
        );
        expect(erased).toBe(1);
        expect(mock.wasRevoked(token)).toBe(true);
    });

    it('não registra token, código, e-mail da conta Google nem título de evento nos logs', () => {
        const everything: string = logged.join('\n');

        expect(everything).not.toMatch(/mock-refresh/);
        expect(everything).not.toContain('mock:');
        expect(everything).not.toContain('@exemplo.test');
        expect(everything).not.toContain('Revisão com a Ana');
        expect(everything).not.toContain('Reunião da segunda pessoa');
        expect(everything).toContain('calendar-oauth');
        expect(everything).toContain('calendar-events');
    });
});

describe('Google Agenda (auto-hospedada)', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        harness = await AllocationHarness.start('google_calendar_self');
    });

    afterAll(async () => {
        Reflect.deleteProperty(process.env, 'DEPLOYMENT_MODE');
        await harness.stop();
    });

    it('sem a credencial google da company responde 503 calendar.provider_disabled', async () => {
        const account: Account = await harness.signUp('cal-self');

        const connection = await harness.call<{ type: string }>(account.token, 'GET', '/calendar/connection');
        const start = await harness.call<{ type: string }>(account.token, 'GET', '/calendar/google/start');

        expect(connection.status).toBe(503);
        expect(connection.body.type).toBe('calendar.provider_disabled');
        expect(start.status).toBe(503);
    });

    it('com a credencial google salva, inicia o fluxo com o client id da company e o callback da auto-hospedada', async () => {
        const account: Account = await harness.signUp('cal-self-ok');
        const saved = await harness.call<unknown>(account.token, 'PUT', '/integrations/google', {
            clientId: '123456-abc.apps.googleusercontent.com',
            clientSecret: 'GOCSPX-segredo-de-teste'
        });
        expect(saved.status).toBeLessThan(300);

        const start = await harness.call<{ url: string }>(account.token, 'GET', '/calendar/google/start');

        expect(start.status).toBe(200);
        const url: URL = new URL(start.body.url);
        expect(url.searchParams.get('client_id')).toBe('123456-abc.apps.googleusercontent.com');
        expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3333/google/callback');
    });
});
