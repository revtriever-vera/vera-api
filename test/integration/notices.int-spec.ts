import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { EnqueueMailRequest, MailerPort } from '../../src/core/mail/mailer.port';
import { User } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { MemberDepartureRegistry } from '../../src/modules/identity/services/member-departure.registry';
import { NoticesApplicationModule } from '../../src/modules/notices/application/notices-application.module';
import { NoticeService } from '../../src/modules/notices/services/notice.service';
import { NoticeTypeRegistry } from '../../src/modules/notices/services/notice-type.registry';
import { Account, AllocationHarness } from './support/allocation-harness';

const TYPE: string = 'probe_notice';
const OTHER_TYPE: string = 'probe_other';

@Injectable()
class ProbeNoticeTypes implements OnModuleInit {
    public constructor(private readonly registry: NoticeTypeRegistry) {}

    public onModuleInit(): void {
        this.registry.register({ type: TYPE, template: 'probe-notice' });
        this.registry.register({ type: OTHER_TYPE, template: 'probe-other' });
    }
}

@Module({ imports: [NoticesApplicationModule], providers: [ProbeNoticeTypes] })
class ProbeNoticesModule {}

interface SettingsBody {
    readonly items: readonly { readonly type: string; readonly enabled: boolean }[];
}

interface SettingBody {
    readonly type: string;
    readonly enabled: boolean;
}

interface ProblemBody {
    readonly type: string;
}

interface PreferenceRow {
    readonly userId: string;
    readonly type: string;
    readonly enabled: boolean;
}

describe('avisos por e-mail', () => {
    let harness: AllocationHarness;
    let sent: EnqueueMailRequest[];
    let enqueue: MockInstance<(request: EnqueueMailRequest) => Promise<void>>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('notices', undefined, [ProbeNoticesModule]);
        enqueue = vi.spyOn(harness.app.get(MailerPort, { strict: false }), 'enqueue');
    });

    afterAll(async () => {
        await harness.stop();
    });

    beforeEach(() => {
        sent = [];
        enqueue.mockReset();
        enqueue.mockImplementation((request: EnqueueMailRequest): Promise<void> => {
            sent.push(request);
            return Promise.resolve();
        });
    });

    async function addViewer(account: Account, label: string): Promise<Account> {
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User = await harness.inCompany(account.company.id, async () =>
            users.createMember({
                email: `${label}-${crypto.randomUUID()}@example.com`,
                name: `Leitor ${label}`,
                role: 'viewer',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await harness.inCompany(account.company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.8', userAgent: 'int-test' }, 'google', 'app')
        );
        return { company: account.company, user, token: tokens.accessToken };
    }

    async function notify(account: Account, key: string, userId?: string): Promise<{ sent: number; skipped: number }> {
        const service: NoticeService = harness.app.get(NoticeService, { strict: false });
        return harness.inCompany(account.company.id, async () =>
            service.notify(account.company.id, { type: TYPE, key, props: { goal: 'Reserva' }, userId })
        );
    }

    function tokenOf(request: EnqueueMailRequest): string {
        return (request.unsubscribeUrl ?? '').split('/notifications/unsubscribe/')[1] ?? '';
    }

    it('lista os tipos registrados ligados por padrão e guarda a escolha da própria pessoa, inclusive no papel Leitura', async () => {
        const owner: Account = await harness.signUp('prefs');
        const viewer: Account = await addViewer(owner, 'prefs');

        const before = await harness.call<SettingsBody>(viewer.token, 'GET', '/notifications/preferences');
        const changed = await harness.call<SettingBody>(viewer.token, 'PATCH', '/notifications/preferences', {
            type: TYPE,
            enabled: false
        });
        const viewerAfter = await harness.call<SettingsBody>(viewer.token, 'GET', '/notifications/preferences');
        const ownerAfter = await harness.call<SettingsBody>(owner.token, 'GET', '/notifications/preferences');

        expect(before.body.items).toEqual([
            { type: 'fixed_income_maturity_soon', enabled: true },
            { type: 'goal_behind', enabled: true },
            { type: 'portfolio_assembly_soon', enabled: true },
            { type: 'portfolio_ex_date_tomorrow', enabled: true },
            { type: 'portfolio_payment_today', enabled: true },
            { type: 'portfolio_weekly_changes', enabled: true },
            { type: TYPE, enabled: true },
            { type: OTHER_TYPE, enabled: true },
            { type: 'recurring_due', enabled: true },
            { type: 'recurring_week', enabled: true }
        ]);
        expect(changed).toEqual({ status: 200, body: { type: TYPE, enabled: false } });
        expect(viewerAfter.body.items).toEqual([
            { type: 'fixed_income_maturity_soon', enabled: true },
            { type: 'goal_behind', enabled: true },
            { type: 'portfolio_assembly_soon', enabled: true },
            { type: 'portfolio_ex_date_tomorrow', enabled: true },
            { type: 'portfolio_payment_today', enabled: true },
            { type: 'portfolio_weekly_changes', enabled: true },
            { type: TYPE, enabled: false },
            { type: OTHER_TYPE, enabled: true },
            { type: 'recurring_due', enabled: true },
            { type: 'recurring_week', enabled: true }
        ]);
        expect(ownerAfter.body.items.every((item) => item.enabled)).toBe(true);
    });

    it('recusa tipo desconhecido, corpo inválido e chamada sem sessão', async () => {
        const owner: Account = await harness.signUp('invalid');

        const unknown = await harness.call<ProblemBody>(owner.token, 'PATCH', '/notifications/preferences', {
            type: 'nope',
            enabled: true
        });
        const invalid = await harness.call<ProblemBody>(owner.token, 'PATCH', '/notifications/preferences', { type: TYPE });
        const anonymous = await harness.call<ProblemBody>(null, 'GET', '/notifications/preferences');

        expect(unknown.status).toBe(422);
        expect(unknown.body.type).toBe('notices.unknown_type');
        expect(invalid.status).toBe(400);
        expect(anonymous.status).toBe(401);
    });

    it('envia a cada pessoa da conta no máximo uma vez por tipo e chave, e pula quem desligou', async () => {
        const owner: Account = await harness.signUp('send');
        const viewer: Account = await addViewer(owner, 'send');
        await harness.call(viewer.token, 'PATCH', '/notifications/preferences', { type: TYPE, enabled: false });

        const first = await notify(owner, '2026-12');
        const repeated = await notify(owner, '2026-12');
        const nextKey = await notify(owner, '2027-01');

        expect(first).toEqual({ sent: 1, skipped: 0 });
        expect(repeated).toEqual({ sent: 0, skipped: 1 });
        expect(nextKey).toEqual({ sent: 1, skipped: 0 });
        expect(sent.map((request) => request.to.email)).toEqual([owner.user.email, owner.user.email]);
        expect(sent[0]).toMatchObject({ template: 'probe-notice', locale: 'pt-BR', props: { goal: 'Reserva' } });
        expect(sent[0]?.unsubscribeUrl).toContain('/notifications/unsubscribe/');
    });

    it('envia a todos da conta, de qualquer papel, e só à pessoa pedida quando há userId', async () => {
        const owner: Account = await harness.signUp('everyone');
        const viewer: Account = await addViewer(owner, 'everyone');

        const everyone = await notify(owner, 'k1');
        const onlyViewer = await notify(owner, 'k2', viewer.user.id);

        expect(everyone.sent).toBe(2);
        expect(onlyViewer.sent).toBe(1);
        expect(sent.map((request) => request.to.email).sort()).toEqual([owner.user.email, viewer.user.email, viewer.user.email].sort());
    });

    it('devolve a chave quando o envio falha, para a próxima tentativa enviar', async () => {
        const owner: Account = await harness.signUp('retry');
        enqueue.mockRejectedValueOnce(new Error('queue down'));

        await expect(notify(owner, 'k1')).rejects.toThrow('queue down');
        const retry = await notify(owner, 'k1');

        expect(retry.sent).toBe(1);
        expect(sent).toHaveLength(1);
    });

    it('descadastra em um clique pelo link assinado, sem sessão, e só aquela pessoa e aquele tipo', async () => {
        const owner: Account = await harness.signUp('unsub');
        const viewer: Account = await addViewer(owner, 'unsub');
        await notify(owner, 'k1');
        const token: string = tokenOf(sent.find((request) => request.to.email === viewer.user.email) as EnqueueMailRequest);

        const first = await harness.call<{ type: string }>(null, 'POST', `/notifications/unsubscribe/${token}`);
        const again = await harness.call<{ type: string }>(null, 'POST', `/notifications/unsubscribe/${token}`);
        const afterViewer = await harness.call<SettingsBody>(viewer.token, 'GET', '/notifications/preferences');
        const afterOwner = await harness.call<SettingsBody>(owner.token, 'GET', '/notifications/preferences');
        sent = [];
        const next = await notify(owner, 'k2');

        expect(first).toEqual({ status: 200, body: { type: TYPE } });
        expect(again.status).toBe(200);
        expect(afterViewer.body.items).toContainEqual({ type: TYPE, enabled: false });
        expect(afterViewer.body.items).toContainEqual({ type: OTHER_TYPE, enabled: true });
        expect(afterOwner.body.items).toContainEqual({ type: TYPE, enabled: true });
        expect(next).toEqual({ sent: 1, skipped: 0 });
    });

    it('recusa link adulterado, de outro formato ou de tipo que não existe, e o GET leva à página de confirmação', async () => {
        const owner: Account = await harness.signUp('tamper');
        await notify(owner, 'k1');
        const token: string = tokenOf(sent[0] as EnqueueMailRequest);
        const [body] = token.split('.');
        const forged: string = `${Buffer.from(`${owner.company.id}.${owner.user.id}.${OTHER_TYPE}`).toString('base64url')}.${token.split('.')[1] ?? ''}`;

        const results = await Promise.all(
            [`${body ?? ''}.deadbeef`, forged, 'abc', 'a.b.c'].map(async (value) =>
                harness.call<ProblemBody>(null, 'POST', `/notifications/unsubscribe/${value}`)
            )
        );
        const page = await harness.callRedirect(`/notifications/unsubscribe/${token}`);
        const badPage = await harness.callRedirect('/notifications/unsubscribe/abc');

        expect(results.map((result) => result.status)).toEqual([404, 404, 404, 404]);
        expect(results[0]?.body.type).toBe('notices.invalid_token');
        expect(page.status).toBe(302);
        expect(page.location).toBe(`http://localhost:5173/avisos/sair/${encodeURIComponent(token)}`);
        expect(badPage.status).toBe(404);
    });

    it('apaga as escolhas e os envios da pessoa que sai da conta e exporta só as da própria conta', async () => {
        const owner: Account = await harness.signUp('export');
        const viewer: Account = await addViewer(owner, 'export');
        const stranger: Account = await harness.signUp('stranger');
        await harness.call(viewer.token, 'PATCH', '/notifications/preferences', { type: TYPE, enabled: false });
        await harness.call(stranger.token, 'PATCH', '/notifications/preferences', { type: TYPE, enabled: false });
        await notify(owner, 'k1');

        const exported = await harness.inCompany(owner.company.id, async () =>
            harness.app.get(AccountDataRegistry, { strict: false }).exportSections(owner.company.id)
        );
        await harness.inCompany(owner.company.id, async () =>
            harness.app.get(MemberDepartureRegistry, { strict: false }).notifyRemoved(viewer.user.id)
        );
        const remaining = await harness.pg.query<PreferenceRow>(
            'SELECT "userId", type, enabled FROM "NoticePreferences" WHERE "companyId" = ANY($1)',
            [[owner.company.id, stranger.company.id]]
        );
        const sends = await harness.pg.query<{ userId: string }>('SELECT "userId" FROM "NoticeSends" WHERE "companyId" = $1', [
            owner.company.id
        ]);

        expect(JSON.stringify(exported)).toContain(viewer.user.id);
        expect(JSON.stringify(exported)).not.toContain(stranger.user.id);
        expect(remaining.rows.map((row) => row.userId)).toEqual([stranger.user.id]);
        expect(sends.rows.map((row) => row.userId)).toEqual([owner.user.id]);
    });
});
