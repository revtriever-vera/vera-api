import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { InvalidFacebookTokenError, InvalidGoogleTokenError } from '../../../src/modules/identity/domain/identity.errors';
import { LoginProvider, SocialIdentity } from '../../../src/modules/identity/domain/identity.types';
import { SocialIdentityVerifierPort } from '../../../src/modules/identity/ports/social-identity-verifier.port';
import { FacebookIdentityVerifier } from '../../../src/modules/identity/services/facebook-identity.verifier';
import { GoogleIdentityVerifier } from '../../../src/modules/identity/services/google-identity.verifier';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { isolateRedisForWorker } from '../support/queue';

class FakeVerifier extends SocialIdentityVerifierPort {
    public enabled: boolean = true;
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

interface LoginBody {
    readonly outcome: string;
    readonly accessToken: string;
    readonly isNewAccount: boolean;
    readonly user: { id: string; name: string; email: string; role: string; companyId: string };
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
}

interface MeBody {
    readonly userId: string;
    readonly companyId: string;
    readonly loginProvider: string;
}

const COOKIE_NAME: string = 'rt_refresh';
const EMAIL_DOMAIN: string = 'example.test';

describe('identity social login', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    const google: FakeVerifier = new FakeVerifier('google');
    const facebook: FakeVerifier = new FakeVerifier('facebook');

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('social');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(GoogleIdentityVerifier)
            .useValue(google)
            .overrideProvider(FacebookIdentityVerifier)
            .useValue(facebook)
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
        google.enabled = true;
        facebook.enabled = true;
        await pg.query('DELETE FROM "Throttles"');
    });

    function emailOf(label: string): string {
        return `${label}-${crypto.randomUUID()}@${EMAIL_DOMAIN}`;
    }

    async function loginGoogle(idToken: string, headers: Record<string, string> = {}): Promise<Response> {
        return fetch(`${origin}/auth/google`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify({ idToken })
        });
    }

    async function loginFacebook(accessToken: string): Promise<Response> {
        return fetch(`${origin}/auth/facebook`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accessToken })
        });
    }

    function cookieOf(response: Response): string | undefined {
        const header: string | undefined = response.headers.getSetCookie().find((entry: string) => entry.startsWith(`${COOKIE_NAME}=`));
        return header?.split(';')[0]?.slice(COOKIE_NAME.length + 1);
    }

    async function count(table: string): Promise<number> {
        const result = await pg.query<{ total: string }>(`SELECT count(*) AS total FROM "${table}"`);
        return Number(result.rows[0]?.total);
    }

    async function me(token: string): Promise<MeBody> {
        const response: Response = await fetch(`${origin}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
        return (await response.json()) as MeBody;
    }

    it('Google com pessoa nova cria company, owner e identidade, seta o cookie e grava o provedor na sessão', async () => {
        const email: string = emailOf('novo');
        const credential: string = google.register({ subject: 'g-new-1', email, name: 'Ana Nova' });
        const before = { companies: await count('Companies'), users: await count('Users'), identities: await count('AuthIdentities') };

        const response: Response = await loginGoogle(credential);
        const body = (await response.json()) as LoginBody;

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ outcome: 'authenticated', isNewAccount: true, user: { name: 'Ana Nova', email, role: 'owner' } });
        expect(cookieOf(response)).toBeDefined();
        expect(await count('Companies')).toBe(before.companies + 1);
        expect(await count('Users')).toBe(before.users + 1);
        expect(await count('AuthIdentities')).toBe(before.identities + 1);
        const user = await pg.query<{ termsAcceptedAt: Date | null; emailVerifiedAt: Date | null }>(
            'SELECT "termsAcceptedAt", "emailVerifiedAt" FROM "Users" WHERE id = $1',
            [body.user.id]
        );
        expect(user.rows[0]?.termsAcceptedAt).not.toBeNull();
        expect(user.rows[0]?.emailVerifiedAt).not.toBeNull();
        const session = await pg.query<{ provider: string }>('SELECT provider FROM "Sessions" WHERE "userId" = $1', [body.user.id]);
        expect(session.rows.map((row) => row.provider)).toEqual(['google']);
        expect((await me(body.accessToken)).loginProvider).toBe('google');
    });

    it('a mesma pessoa de novo entra sem criar linhas e mantém o termsAcceptedAt', async () => {
        const credential: string = google.register({ subject: 'g-again-1', email: emailOf('again'), name: 'Ana Again' });
        const first = (await (await loginGoogle(credential)).json()) as LoginBody;
        const accepted = await pg.query<{ termsAcceptedAt: Date }>('SELECT "termsAcceptedAt" FROM "Users" WHERE id = $1', [first.user.id]);
        const before = { companies: await count('Companies'), users: await count('Users'), identities: await count('AuthIdentities') };

        const response: Response = await loginGoogle(credential);
        const second = (await response.json()) as LoginBody;

        expect(response.status).toBe(200);
        expect(second.isNewAccount).toBe(false);
        expect(second.user.id).toBe(first.user.id);
        expect({ companies: await count('Companies'), users: await count('Users'), identities: await count('AuthIdentities') }).toEqual(
            before
        );
        const after = await pg.query<{ termsAcceptedAt: Date }>('SELECT "termsAcceptedAt" FROM "Users" WHERE id = $1', [first.user.id]);
        expect(after.rows[0]?.termsAcceptedAt).toEqual(accepted.rows[0]?.termsAcceptedAt);
    });

    it('duas requisições simultâneas com a mesma identidade nova geram uma company só', async () => {
        const credential: string = google.register({ subject: 'g-race-1', email: emailOf('race'), name: 'Ana Race' });
        const before: number = await count('Companies');

        const [a, b] = await Promise.all([loginGoogle(credential), loginGoogle(credential)]);

        expect([a.status, b.status]).toEqual([200, 200]);
        const bodies = [(await a.json()) as LoginBody, (await b.json()) as LoginBody];
        expect(bodies[0]?.user.companyId).toBe(bodies[1]?.user.companyId);
        expect(await count('Companies')).toBe(before + 1);
    });

    it('Facebook com pessoa nova cria a conta com emailVerifiedAt nulo; Google com o mesmo e-mail depois dá 409 e não vincula (pré-sequestro)', async () => {
        const email: string = emailOf('victim');
        const fbCredential: string = facebook.register({ subject: 'fb-pre-1', email, name: 'Atacante' });
        const created = (await (await loginFacebook(fbCredential)).json()) as LoginBody;
        const verified = await pg.query<{ emailVerifiedAt: Date | null }>('SELECT "emailVerifiedAt" FROM "Users" WHERE id = $1', [
            created.user.id
        ]);
        expect(created.isNewAccount).toBe(true);
        expect(verified.rows[0]?.emailVerifiedAt).toBeNull();
        const identitiesBefore: number = await count('AuthIdentities');
        const companiesBefore: number = await count('Companies');

        const response: Response = await loginGoogle(google.register({ subject: 'g-victim-1', email, name: 'Vítima' }));

        expect(response.status).toBe(409);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.email_in_use');
        expect(await count('AuthIdentities')).toBe(identitiesBefore);
        expect(await count('Companies')).toBe(companiesBefore);
    });

    it('Google verificado e depois Facebook com o mesmo e-mail dá 409 enquanto o Facebook não é verificado', async () => {
        const email: string = emailOf('gfirst');
        await loginGoogle(google.register({ subject: 'g-first-1', email, name: 'Ana' }));
        const identitiesBefore: number = await count('AuthIdentities');

        const response: Response = await loginFacebook(facebook.register({ subject: 'fb-second-1', email, name: 'Ana' }));

        expect(response.status).toBe(409);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.email_in_use');
        expect(await count('AuthIdentities')).toBe(identitiesBefore);
    });

    it('Google verificado vincula a um usuário existente com e-mail verificado e cai na mesma company', async () => {
        const email: string = emailOf('link');
        const first = (await (await loginGoogle(google.register({ subject: 'g-link-1', email, name: 'Ana' }))).json()) as LoginBody;
        const identitiesBefore: number = await count('AuthIdentities');

        const response: Response = await loginGoogle(google.register({ subject: 'g-link-2', email, name: 'Ana' }));
        const second = (await response.json()) as LoginBody;

        expect(response.status).toBe(200);
        expect(second.isNewAccount).toBe(false);
        expect(second.user.id).toBe(first.user.id);
        expect(second.user.companyId).toBe(first.user.companyId);
        expect(await count('AuthIdentities')).toBe(identitiesBefore + 1);
    });

    it('Facebook sem e-mail responde 422 e não cria company nem usuário', async () => {
        const before = { companies: await count('Companies'), users: await count('Users'), identities: await count('AuthIdentities') };

        const response: Response = await loginFacebook(facebook.register({ subject: 'fb-noemail-1', name: 'Sem Email' }));

        expect(response.status).toBe(422);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.email_not_provided');
        expect({ companies: await count('Companies'), users: await count('Users'), identities: await count('AuthIdentities') }).toEqual(
            before
        );
    });

    it('Facebook com pessoa nova e depois de novo entra pela identidade, com o provedor na sessão', async () => {
        const credential: string = facebook.register({ subject: 'fb-ok-1', email: emailOf('fb'), name: 'Fê Bê' });

        const first = (await (await loginFacebook(credential)).json()) as LoginBody;
        const again: Response = await loginFacebook(credential);
        const second = (await again.json()) as LoginBody;

        expect(first.isNewAccount).toBe(true);
        expect(second).toMatchObject({ isNewAccount: false, user: { id: first.user.id } });
        expect((await me(second.accessToken)).loginProvider).toBe('facebook');
    });

    it('credencial recusada pelo provedor responde 401 no código do provedor e nada é criado', async () => {
        const before: number = await count('Users');

        const g: Response = await loginGoogle('credential-that-the-provider-rejects');
        const f: Response = await loginFacebook('credential-that-the-provider-rejects');

        expect(g.status).toBe(401);
        expect(((await g.json()) as ProblemBody).type).toBe('identity.invalid_google_token');
        expect(f.status).toBe(401);
        expect(((await f.json()) as ProblemBody).type).toBe('identity.invalid_facebook_token');
        expect(await count('Users')).toBe(before);
    });

    it('corpo inválido responde 400', async () => {
        const response: Response = await loginGoogle('curto');

        expect(response.status).toBe(400);
    });

    it('Accept-Language en-US na primeira entrada grava Companies.locale = en; sem header, pt-BR', async () => {
        const english = (await (
            await loginGoogle(google.register({ subject: 'g-en-1', email: emailOf('en'), name: 'En' }), { 'accept-language': 'en-US' })
        ).json()) as LoginBody;
        const portuguese = (await (
            await loginGoogle(google.register({ subject: 'g-pt-1', email: emailOf('pt'), name: 'Pt' }), { 'accept-language': '' })
        ).json()) as LoginBody;

        const locales = await pg.query<{ id: string; locale: string }>('SELECT id, locale FROM "Companies" WHERE id = ANY($1)', [
            [english.user.companyId, portuguese.user.companyId]
        ]);
        const byId: Map<string, string> = new Map(locales.rows.map((row) => [row.id, row.locale]));
        expect(byId.get(english.user.companyId)).toBe('en');
        expect(byId.get(portuguese.user.companyId)).toBe('pt-BR');
    });

    it('provedor sem configuração responde 503 nas duas rotas, sem efeito no banco', async () => {
        google.enabled = false;
        facebook.enabled = false;
        const before = { companies: await count('Companies'), users: await count('Users') };

        const g: Response = await loginGoogle(google.register({ subject: 'g-off-1', email: emailOf('off') }));
        const f: Response = await loginFacebook(facebook.register({ subject: 'fb-off-1', email: emailOf('off') }));

        expect([g.status, f.status]).toEqual([503, 503]);
        expect(((await g.json()) as ProblemBody).type).toBe('identity.provider_disabled');
        expect(((await f.json()) as ProblemBody).type).toBe('identity.provider_disabled');
        expect({ companies: await count('Companies'), users: await count('Users') }).toEqual(before);
    });

    it('a 31ª chamada do mesmo IP na janela responde 429', async () => {
        const statuses: number[] = [];
        for (let attempt: number = 0; attempt < 31; attempt += 1) {
            statuses.push((await loginGoogle('credential-that-the-provider-rejects')).status);
        }

        expect(statuses.slice(0, 30).every((status: number) => status === 401)).toBe(true);
        expect(statuses[30]).toBe(429);
    });

    it('com duas companies, o /auth/me de cada uma só devolve a própria e a identidade de uma não resolve o usuário da outra', async () => {
        const a = (await (
            await loginGoogle(google.register({ subject: 'g-iso-a', email: emailOf('iso-a'), name: 'A' }))
        ).json()) as LoginBody;
        const credentialB: string = google.register({ subject: 'g-iso-b', email: emailOf('iso-b'), name: 'B' });
        const b = (await (await loginGoogle(credentialB)).json()) as LoginBody;

        const meA: MeBody = await me(a.accessToken);
        const meB: MeBody = await me(b.accessToken);
        const again = (await (await loginGoogle(credentialB)).json()) as LoginBody;

        expect(meA).toMatchObject({ userId: a.user.id, companyId: a.user.companyId });
        expect(meB).toMatchObject({ userId: b.user.id, companyId: b.user.companyId });
        expect(a.user.companyId).not.toBe(b.user.companyId);
        expect(again.user.id).toBe(b.user.id);
        expect(again.user.companyId).toBe(b.user.companyId);
    });
});
