import { AddressInfo, Server } from 'node:net';
import { INestApplication, Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { EnqueueMailRequest } from '../../../src/core/mail/mailer.port';
import { QueuePublisherPort } from '../../../src/core/queue/queue.types';
import { MESSAGE_TYPES } from '../../../src/shared/constants/queues.constants';
import { InvalidFacebookTokenError, InvalidGoogleTokenError } from '../../../src/modules/identity/domain/identity.errors';
import { LoginProvider, SocialIdentity } from '../../../src/modules/identity/domain/identity.types';
import { SocialIdentityVerifierPort } from '../../../src/modules/identity/ports/social-identity-verifier.port';
import { FacebookIdentityVerifier } from '../../../src/modules/identity/services/facebook-identity.verifier';
import { GoogleIdentityVerifier } from '../../../src/modules/identity/services/google-identity.verifier';
import { MembersCleanupApplication } from '../../../src/modules/identity/application/members-cleanup.application';
import { MemberDeparturePort } from '../../../src/modules/identity/services/member-departure.port';
import {
    OnboardingArea,
    OnboardingAreaSummary,
    OnboardingAreaSummaryPort
} from '../../../src/modules/onboarding/services/onboarding-area-summary.port';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { CapturingPublisher, isolateRedisForWorker } from '../support/queue';

class FakeVerifier extends SocialIdentityVerifierPort {
    public readonly enabled: boolean = true;
    private readonly known: Map<string, SocialIdentity> = new Map<string, SocialIdentity>();

    public constructor(public readonly provider: LoginProvider) {
        super();
    }

    public register(identity: Partial<SocialIdentity> & { subject: string }): string {
        const credential: string = `fake-${this.provider}-credential-${crypto.randomUUID()}`;
        this.known.set(credential, {
            provider: this.provider,
            email: null,
            emailVerified: this.provider === 'google',
            name: null,
            ...identity
        });
        return credential;
    }

    public verify(credential: string): Promise<SocialIdentity> {
        const identity: SocialIdentity | undefined = this.known.get(credential);
        if (identity) {
            return Promise.resolve(identity);
        }
        return Promise.reject(this.provider === 'google' ? new InvalidGoogleTokenError() : new InvalidFacebookTokenError());
    }
}

@Injectable()
class RecordingDeparture extends MemberDeparturePort {
    public readonly area: string = 'recording';
    public readonly removed: string[] = [];

    public onMemberRemoved(userId: string): Promise<void> {
        this.removed.push(userId);
        return Promise.resolve();
    }
}

@Injectable()
class ScriptedAssetsSummary extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'assets';
    public readonly withData: Set<string> = new Set<string>();

    public summarize(companyId: string): Promise<OnboardingAreaSummary> {
        return Promise.resolve({ items: this.withData.has(companyId) ? 1 : 0, amountCents: null, currency: null });
    }
}

const departure: RecordingDeparture = new RecordingDeparture();
const assets: ScriptedAssetsSummary = new ScriptedAssetsSummary();

@Module({
    providers: [
        { provide: 'TEST_DEPARTURE', useValue: departure },
        { provide: 'TEST_ASSETS', useValue: assets }
    ]
})
class ScriptedPortsModule {}

interface LoginBody {
    readonly accessToken: string;
    readonly isNewAccount: boolean;
    readonly joinedAccount: boolean;
    readonly user: { id: string; email: string; role: string; companyId: string };
}

interface Person {
    readonly token: string;
    readonly userId: string;
    readonly companyId: string;
    readonly email: string;
}

interface ProblemBody {
    readonly type: string;
}

interface MembersBody {
    readonly members: { userId: string; email: string | null; role: string; isYou: boolean }[];
    readonly invites: { id: string; email: string | null; role: string }[];
}

interface InviteBody {
    readonly invite: { id: string; email: string; role: string };
}

const EMAIL_DOMAIN: string = 'example.test';

describe('identity members and invites', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    const google: FakeVerifier = new FakeVerifier('google');
    const facebook: FakeVerifier = new FakeVerifier('facebook');
    const publisher: CapturingPublisher = new CapturingPublisher();

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('members');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule, ScriptedPortsModule] })
            .overrideProvider(GoogleIdentityVerifier)
            .useValue(google)
            .overrideProvider(FacebookIdentityVerifier)
            .useValue(facebook)
            .overrideProvider(QueuePublisherPort)
            .useValue(publisher)
            .compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        publisher.published.length = 0;
        departure.removed.length = 0;
        await pg.query('DELETE FROM "Throttles"');
    });

    function emailOf(label: string): string {
        return `${label}-${crypto.randomUUID()}@${EMAIL_DOMAIN}`;
    }

    async function call<T>(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) {
            headers['authorization'] = `Bearer ${token}`;
        }
        const response: Response = await fetch(`${origin}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text: string = await response.text();
        return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : null) as T };
    }

    async function loginWith(credential: string, inviteToken?: string): Promise<{ status: number; body: LoginBody & ProblemBody }> {
        return call<LoginBody & ProblemBody>(null, 'POST', '/auth/google', { idToken: credential, inviteToken });
    }

    async function signUp(label: string): Promise<Person & { subject: string }> {
        const email: string = emailOf(label);
        const subject: string = `subject-${crypto.randomUUID()}`;
        const response = await loginWith(google.register({ subject, email, name: `Pessoa ${label}` }));
        return { token: response.body.accessToken, userId: response.body.user.id, companyId: response.body.user.companyId, email, subject };
    }

    function mailsTo(email: string, template: string): EnqueueMailRequest[] {
        return publisher
            .ofType(MESSAGE_TYPES.emailSendRequested)
            .map((message): EnqueueMailRequest => message.payload as EnqueueMailRequest)
            .filter((mail: EnqueueMailRequest) => mail.to.email === email && mail.template === template);
    }

    function tokenOf(mail: EnqueueMailRequest | undefined): string {
        return (mail?.props['link'] ?? '').split('/convite/')[1] ?? '';
    }

    async function invite(
        owner: Person,
        email: string,
        role: string
    ): Promise<{ status: number; body: InviteBody & ProblemBody; token: string }> {
        const response = await call<InviteBody & ProblemBody>(owner.token, 'POST', '/members/invites', { email, role });
        return { ...response, token: tokenOf(mailsTo(email, 'member-invited').at(-1)) };
    }

    async function joinAs(owner: Person, role: string, label: string): Promise<Person> {
        const email: string = emailOf(label);
        const sent = await invite(owner, email, role);
        const credential: string = google.register({ subject: `subject-${crypto.randomUUID()}`, email, name: `Pessoa ${label}` });
        const response = await loginWith(credential, sent.token);
        return { token: response.body.accessToken, userId: response.body.user.id, companyId: response.body.user.companyId, email };
    }

    async function count(table: string): Promise<number> {
        const result = await pg.query<{ total: string }>(`SELECT count(*) AS total FROM "${table}"`);
        return Number(result.rows[0]?.total);
    }

    it('o Dono convida, o convite aparece na lista e o e-mail sai com o link', async () => {
        const owner = await signUp('owner');
        const email: string = emailOf('convidada');

        const sent = await invite(owner, email, 'editor');
        const list = await call<MembersBody>(owner.token, 'GET', '/members');

        expect(sent.status).toBe(201);
        expect(sent.token.length).toBeGreaterThan(20);
        expect(mailsTo(email, 'member-invited')[0]?.props['link']).toMatch(/\/convite\/.+/);
        expect(list.body.invites.map((item) => item.email)).toEqual([email]);
        const stored = await pg.query<{ tokenHash: string }>('SELECT "tokenHash" FROM "AccountInvites" WHERE id = $1', [
            sent.body.invite.id
        ]);
        expect(stored.rows[0]?.tokenHash).not.toContain(sent.token);
    });

    it('a consulta pública mostra o e-mail mascarado e nunca o inteiro', async () => {
        const owner = await signUp('owner');
        const email: string = emailOf('mascarada');
        const sent = await invite(owner, email, 'viewer');

        const response = await call<{ emailMasked: string; role: string; accountName: string }>(null, 'GET', `/invites/${sent.token}`);

        expect(response.status).toBe(200);
        expect(response.body.emailMasked).toBe(`${email.slice(0, 1)}***@${EMAIL_DOMAIN}`);
        expect(response.body.role).toBe('viewer');
        expect(JSON.stringify(response.body)).not.toContain(email);
        expect((await call<ProblemBody>(null, 'GET', '/invites/token-inexistente-aaaaaaaaaaaaaaaa')).status).toBe(410);
    });

    it('o login com o mesmo e-mail e o token entra na conta do Dono, com o papel do convite e sem criar company', async () => {
        const owner = await signUp('owner');
        const email: string = emailOf('nova');
        const sent = await invite(owner, email, 'editor');
        const companies: number = await count('Companies');

        const response = await loginWith(google.register({ subject: `s-${crypto.randomUUID()}`, email, name: 'Pessoa Nova' }), sent.token);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            isNewAccount: false,
            joinedAccount: true,
            user: { role: 'editor', companyId: owner.companyId }
        });
        expect(await count('Companies')).toBe(companies);
        const list = await call<MembersBody>(owner.token, 'GET', '/members');
        expect(list.body.members).toHaveLength(2);
        expect(list.body.invites).toEqual([]);
    });

    it('e-mail diferente e Facebook sem e-mail verificado dão 409 e nada muda', async () => {
        const owner = await signUp('owner');
        const sent = await invite(owner, emailOf('alvo'), 'editor');
        const users: number = await count('Users');

        const other = await loginWith(
            google.register({ subject: `s-${crypto.randomUUID()}`, email: emailOf('outra'), name: 'Outra' }),
            sent.token
        );
        const noEmail = await call<ProblemBody>(null, 'POST', '/auth/facebook', {
            accessToken: facebook.register({ subject: `f-${crypto.randomUUID()}` }),
            inviteToken: sent.token
        });

        expect(other.status).toBe(409);
        expect(other.body.type).toBe('invites.email_mismatch');
        expect(noEmail.status).toBe(409);
        expect(noEmail.body.type).toBe('invites.email_mismatch');
        expect(await count('Users')).toBe(users);
    });

    it('token expirado dá 410; o mesmo token de novo dá 410 para outra identidade e 200 para a mesma pessoa', async () => {
        const owner = await signUp('owner');
        const expiredFor: string = emailOf('expirada');
        const expired = await invite(owner, expiredFor, 'viewer');
        await pg.query(`UPDATE "AccountInvites" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [expired.body.invite.id]);
        const email: string = emailOf('uma-vez');
        const sent = await invite(owner, email, 'viewer');
        const subject: string = `s-${crypto.randomUUID()}`;
        const credential: string = google.register({ subject, email, name: 'Uma Vez' });

        const late = await loginWith(
            google.register({ subject: `s-${crypto.randomUUID()}`, email: expiredFor, name: 'Tarde' }),
            expired.token
        );
        const first = await loginWith(credential, sent.token);
        const again = await loginWith(credential, sent.token);
        const stranger = await loginWith(google.register({ subject: `s-${crypto.randomUUID()}`, email, name: 'Outra' }), sent.token);

        expect(late.status).toBe(410);
        expect(first.status).toBe(200);
        expect(again.status).toBe(200);
        expect(again.body.user.id).toBe(first.body.user.id);
        expect(stranger.status).toBe(410);
    });

    it('dois aceites simultâneos do mesmo convite criam um usuário só', async () => {
        const owner = await signUp('owner');
        const email: string = emailOf('corrida');
        const sent = await invite(owner, email, 'editor');
        const credential: string = google.register({ subject: `s-${crypto.randomUUID()}`, email, name: 'Corrida' });

        const [a, b] = await Promise.all([loginWith(credential, sent.token), loginWith(credential, sent.token)]);

        expect([a.status, b.status]).toEqual([200, 200]);
        const rows = await pg.query('SELECT id FROM "Users" WHERE email = $1', [email]);
        expect(rows.rowCount).toBe(1);
    });

    it('quem tem conta própria vazia entra, e a company antiga some com o onboarding', async () => {
        const owner = await signUp('owner');
        const visitor = await signUp('vazia');
        await call(visitor.token, 'GET', '/onboarding');
        const sent = await invite(owner, visitor.email, 'editor');

        const response = await loginWith(google.register({ subject: visitor.subject, email: visitor.email, name: 'Vazia' }), sent.token);

        expect(response.status).toBe(200);
        expect(response.body.user.companyId).toBe(owner.companyId);
        expect((await pg.query('SELECT id FROM "Companies" WHERE id = $1', [visitor.companyId])).rowCount).toBe(0);
        expect((await pg.query('SELECT 1 FROM "OnboardingStates" WHERE "companyId" = $1', [visitor.companyId])).rowCount).toBe(0);
        expect((await pg.query('SELECT 1 FROM "AccountDeletionLog"')).rowCount).toBeGreaterThan(0);
    });

    it('quem tem um ativo na conta própria recebe 409 members.account_not_empty e nada muda', async () => {
        const owner = await signUp('owner');
        const visitor = await signUp('com-ativo');
        assets.withData.add(visitor.companyId);
        const sent = await invite(owner, visitor.email, 'editor');

        const response = await loginWith(
            google.register({ subject: visitor.subject, email: visitor.email, name: 'Com Ativo' }),
            sent.token
        );

        expect(response.status).toBe(409);
        expect(response.body.type).toBe('members.account_not_empty');
        expect((await pg.query('SELECT id FROM "Companies" WHERE id = $1', [visitor.companyId])).rowCount).toBe(1);
        expect(
            (await pg.query('SELECT "acceptedAt" FROM "AccountInvites" WHERE id = $1', [sent.body.invite.id])).rows[0]?.acceptedAt
        ).toBeNull();
        assets.withData.delete(visitor.companyId);
    });

    it('troca o papel, e rebaixar o único Dono dá 409', async () => {
        const owner = await signUp('owner');
        const editor = await joinAs(owner, 'editor', 'editor');

        const changed = await call<{ member: { role: string } }>(owner.token, 'PATCH', `/members/${editor.userId}`, { role: 'viewer' });
        const demoteSelf = await call<ProblemBody>(owner.token, 'PATCH', `/members/${owner.userId}`, { role: 'editor' });
        await call(owner.token, 'PATCH', `/members/${editor.userId}`, { role: 'owner' });
        const demoteWithTwo = await call(owner.token, 'PATCH', `/members/${owner.userId}`, { role: 'editor' });

        expect(changed.body.member.role).toBe('viewer');
        expect(demoteSelf.status).toBe(409);
        expect(demoteSelf.body.type).toBe('members.last_owner');
        expect(demoteWithTwo.status).toBe(200);
    });

    it('remover um Editor corta as sessões, avisa por e-mail, chama as portas e libera o e-mail para um novo convite', async () => {
        const owner = await signUp('owner');
        const editor = await joinAs(owner, 'editor', 'removido');

        const removal = await call(owner.token, 'DELETE', `/members/${editor.userId}`);
        const afterwards = await call(editor.token, 'GET', '/members');
        const again = await invite(owner, editor.email, 'viewer');
        const rejoined = await loginWith(
            google.register({ subject: `s-${crypto.randomUUID()}`, email: editor.email, name: 'Volta' }),
            again.token
        );

        expect(removal.status).toBe(204);
        expect(afterwards.status).toBe(401);
        expect(mailsTo(editor.email, 'member-removed')).toHaveLength(1);
        expect(departure.removed).toEqual([editor.userId]);
        expect(rejoined.status).toBe(200);
        expect(rejoined.body.user.role).toBe('viewer');
        expect((await call<ProblemBody>(owner.token, 'DELETE', `/members/${owner.userId}`)).status).toBe(400);
    });

    it('um Editor sai da conta, e o único Dono não sai', async () => {
        const owner = await signUp('owner');
        const editor = await joinAs(owner, 'editor', 'saida');

        const left = await call(editor.token, 'POST', '/members/me/leave');
        const soleOwner = await call<ProblemBody>(owner.token, 'POST', '/members/me/leave');

        expect(left.status).toBe(204);
        expect(mailsTo(editor.email, 'member-left')).toHaveLength(1);
        expect((await call(editor.token, 'GET', '/members')).status).toBe(401);
        expect(soleOwner.status).toBe(409);
        expect(soleOwner.body.type).toBe('members.last_owner');
    });

    it('Editor não convida nem vê e-mails alheios; Leitura segue lendo a lista', async () => {
        const owner = await signUp('owner');
        const editor = await joinAs(owner, 'editor', 'editor');
        await invite(owner, emailOf('pendente'), 'viewer');

        const forbidden = await call<ProblemBody>(editor.token, 'POST', '/members/invites', { email: emailOf('x'), role: 'viewer' });
        const list = await call<MembersBody>(editor.token, 'GET', '/members');

        expect(forbidden.status).toBe(403);
        expect(list.body.invites).toEqual([]);
        expect(list.body.members.find((member) => !member.isYou)?.email).toBeNull();
        expect(list.body.members.find((member) => member.isYou)?.email).toBe(editor.email);
    });

    it('excluir a conta com dois membros avisa os dois e não sobra nada', async () => {
        const owner = await signUp('owner');
        const editor = await joinAs(owner, 'editor', 'apagada');

        const deleted = await call(owner.token, 'DELETE', '/account', { confirmEmail: owner.email });

        expect(deleted.status).toBe(204);
        expect(mailsTo(owner.email, 'account-deleted')).toHaveLength(1);
        expect(mailsTo(editor.email, 'account-deleted-member')).toHaveLength(1);
        expect((await pg.query('SELECT 1 FROM "Users" WHERE "companyId" = $1', [owner.companyId])).rowCount).toBe(0);
        expect((await pg.query('SELECT 1 FROM "AccountInvites" WHERE "companyId" = $1', [owner.companyId])).rowCount).toBe(0);
    });

    it('o Dono de A não lista, não muda papel, não remove nem revoga em B, e o convite de A não põe ninguém em B', async () => {
        const a = await signUp('a');
        const b = await signUp('b');
        const bEditor = await joinAs(b, 'editor', 'b-editor');
        const bInvite = await invite(b, emailOf('b-pendente'), 'viewer');

        const patched = await call<ProblemBody>(a.token, 'PATCH', `/members/${bEditor.userId}`, { role: 'owner' });
        const removed = await call<ProblemBody>(a.token, 'DELETE', `/members/${bEditor.userId}`);
        const revoked = await call<ProblemBody>(a.token, 'DELETE', `/members/invites/${bInvite.body.invite.id}`);
        const resent = await call<ProblemBody>(a.token, 'POST', `/members/invites/${bInvite.body.invite.id}/resend`);
        const list = await call<MembersBody>(a.token, 'GET', '/members');
        const inviteA = await invite(a, emailOf('so-a'), 'editor');
        const joined = await loginWith(
            google.register({ subject: `s-${crypto.randomUUID()}`, email: emailOf('so-a'), name: 'X' }),
            inviteA.token
        );

        expect([patched.status, removed.status, revoked.status, resent.status]).toEqual([404, 404, 404, 404]);
        expect(list.body.members).toHaveLength(1);
        expect(joined.status).toBe(409);
        expect((await call<MembersBody>(b.token, 'GET', '/members')).body.members).toHaveLength(2);
    });

    it('reenviar troca o token (o antigo morre) e o 6º reenvio na hora dá 429', async () => {
        const owner = await signUp('owner');
        const email: string = emailOf('reenvio');
        const first = await invite(owner, email, 'viewer');

        const resent = await call<InviteBody>(owner.token, 'POST', `/members/invites/${first.body.invite.id}/resend`);
        const fresh: string = tokenOf(mailsTo(email, 'member-invited').at(-1));
        const statuses: number[] = [];
        for (let attempt: number = 0; attempt < 5; attempt += 1) {
            statuses.push((await call(owner.token, 'POST', `/members/invites/${first.body.invite.id}/resend`)).status);
        }

        expect(resent.status).toBe(200);
        expect(fresh).not.toBe(first.token);
        expect((await call(null, 'GET', `/invites/${first.token}`)).status).toBe(410);
        expect(statuses.at(-1)).toBe(429);
    });

    it('convidar o mesmo e-mail pendente reenvia, quem já é membro dá 409 e o limite conta os pendentes', async () => {
        const owner = await signUp('owner');
        const member = await joinAs(owner, 'viewer', 'membro');
        const email: string = emailOf('repetido');
        await invite(owner, email, 'viewer');

        const repeated = await invite(owner, email, 'editor');
        const alreadyMember = await call<ProblemBody>(owner.token, 'POST', '/members/invites', { email: member.email, role: 'viewer' });
        for (let index: number = 0; index < 7; index += 1) {
            await invite(owner, emailOf(`fila-${String(index)}`), 'viewer');
        }
        const overLimit = await call<ProblemBody>(owner.token, 'POST', '/members/invites', { email: emailOf('demais'), role: 'viewer' });

        expect(repeated.status).toBe(201);
        expect(mailsTo(email, 'member-invited')).toHaveLength(2);
        expect((await pg.query('SELECT 1 FROM "AccountInvites" WHERE email = $1', [email])).rowCount).toBe(1);
        expect(alreadyMember.body.type).toBe('invites.already_member');
        expect(overLimit.status).toBe(409);
        expect(overLimit.body.type).toBe('members.limit_reached');
    });

    it('o 21º convite no dia dá 429', async () => {
        const owner = await signUp('owner');
        let last: number = 0;

        for (let index: number = 0; index < 21; index += 1) {
            const sent = await invite(owner, emailOf(`dia-${String(index)}`), 'viewer');
            last = sent.status;
            if (sent.status === 201) {
                await call(owner.token, 'DELETE', `/members/invites/${sent.body.invite.id}`);
            }
        }

        expect(last).toBe(429);
    });

    it('a limpeza anonimiza só quem saiu há 30 dias ou mais', async () => {
        const owner = await signUp('owner');
        const old = await joinAs(owner, 'editor', 'antigo');
        const recent = await joinAs(owner, 'editor', 'recente');
        await call(owner.token, 'DELETE', `/members/${old.userId}`);
        await call(owner.token, 'DELETE', `/members/${recent.userId}`);
        await pg.query(`UPDATE "Users" SET "removedAt" = now() - interval '31 days' WHERE id = $1`, [old.userId]);

        const cleanup: MembersCleanupApplication = app.get(MembersCleanupApplication, { strict: false });
        const total: number = await app.get(AppContext).run({ requestId: 'tick', locale: 'pt-BR' }, async () => cleanup.anonymizeRemoved());
        const rows = await pg.query<{ id: string; email: string; name: string }>('SELECT id, email, name FROM "Users" WHERE id = ANY($1)', [
            [old.userId, recent.userId]
        ]);

        expect(total).toBe(1);
        expect(rows.rows.find((row) => row.id === old.userId)).toMatchObject({
            email: `${old.userId}@removed.invalid`,
            name: 'Pessoa removida'
        });
        expect(rows.rows.find((row) => row.id === recent.userId)?.email).toBe(recent.email);
    });
});
