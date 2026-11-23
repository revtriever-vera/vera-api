import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AppContext } from '../../src/core/context/app-context.port';
import { InvalidGoogleTokenError } from '../../src/modules/identity/domain/identity.errors';
import { LoginProvider, SocialIdentity } from '../../src/modules/identity/domain/identity.types';
import { SocialIdentityVerifierPort } from '../../src/modules/identity/ports/social-identity-verifier.port';
import { GoogleIdentityVerifier } from '../../src/modules/identity/services/google-identity.verifier';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { isolateRedisForWorker } from './support/queue';

class FakeGoogle extends SocialIdentityVerifierPort {
    public readonly provider: LoginProvider = 'google';
    public enabled: boolean = true;
    private readonly known: Map<string, SocialIdentity> = new Map<string, SocialIdentity>();

    public register(identity: Partial<SocialIdentity> & { subject: string }): string {
        const credential: string = `fake-google-credential-${crypto.randomUUID()}`;
        this.known.set(credential, { provider: 'google', email: null, emailVerified: true, name: null, ...identity });
        return credential;
    }

    public verify(credential: string): Promise<SocialIdentity> {
        const identity: SocialIdentity | undefined = this.known.get(credential);
        return identity ? Promise.resolve(identity) : Promise.reject(new InvalidGoogleTokenError());
    }
}

interface LoginBody {
    readonly accessToken: string;
    readonly user: { id: string; companyId: string };
    readonly offer: { redeemed: boolean; reason: string | null } | null;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { reason?: string };
}

interface MeBody {
    readonly plan: string;
    readonly trial: { kind: string; daysLeft: number } | null;
    readonly offer: { trial: { kind: string; days: number | null }; rules: unknown[]; expiresAt: string } | null;
}

interface LinkSeed {
    readonly kind?: 'none' | 'card' | 'no_card';
    readonly days?: number | null;
    readonly maxUses?: number | null;
}

const GOOGLE: FakeGoogle = new FakeGoogle();
const IP_LIMIT: number = 3;
const DAY_MS: number = 24 * 60 * 60 * 1000;

describe('resgate de links de cadastro (hospedada)', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;

    function request(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
        return fetch(`${origin}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
    }

    async function seedLink(seed: LinkSeed = {}): Promise<string> {
        const kind: string = seed.kind ?? 'none';
        const token: string = `offer-${crypto.randomUUID()}`;
        const bounded: boolean = kind === 'no_card';
        await pg.query(
            `INSERT INTO "SignupLinks" (id, token, label, "trialKind", "trialDays", rules, "maxUses", "expiresAt")
             VALUES ($1, $2, 'Parceria', $3, $4, $5::jsonb, $6, $7)`,
            [
                crypto.randomUUID(),
                token,
                kind,
                kind === 'none' ? null : (seed.days ?? 7),
                JSON.stringify([{ percent: 50, fromCycle: 1, toCycle: 3 }]),
                seed.maxUses ?? (bounded ? 100 : null),
                bounded ? new Date(Date.now() + 30 * DAY_MS) : null
            ]
        );
        return token;
    }

    async function login(email: string, offerToken?: string, emailVerified: boolean = true): Promise<LoginBody> {
        const response: Response = await request('POST', '/auth/google', {
            idToken: GOOGLE.register({ subject: `g-${crypto.randomUUID()}`, email, name: 'Pessoa', emailVerified }),
            ...(offerToken === undefined ? {} : { offerToken })
        });
        expect(response.status).toBe(200);
        return (await response.json()) as LoginBody;
    }

    async function me(token: string): Promise<MeBody> {
        return (await (await request('GET', '/billing/me', undefined, token)).json()) as MeBody;
    }

    async function counts(token: string): Promise<{ redemptionCount: number; trialCount: number }> {
        const rows = await pg.query<{ redemptionCount: number; trialCount: number }>(
            'SELECT "redemptionCount", "trialCount" FROM "SignupLinks" WHERE token = $1',
            [token]
        );
        return rows.rows[0] ?? { redemptionCount: -1, trialCount: -1 };
    }

    function fresh(prefix: string): string {
        return `${prefix}-${crypto.randomUUID()}@example.test`;
    }

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('signup_redemption');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['DEPLOYMENT_MODE'] = 'hosted';
        process.env['SIGNUP_REDEEM_IP_DAILY_LIMIT'] = String(IP_LIMIT);
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(GoogleIdentityVerifier)
            .useValue(GOOGLE)
            .compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        origin = `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
        delete process.env['SIGNUP_REDEEM_IP_DAILY_LIMIT'];
    });

    beforeEach(async () => {
        await pg.query('DELETE FROM "Throttles"');
    });

    it('cadastro com link de teste sem cartão: abre o Premium de teste, conta o uso e o teste, grava a marca e mostra a oferta em /billing/me', async () => {
        const token: string = await seedLink({ kind: 'no_card', days: 14 });

        const result: LoginBody = await login(fresh('novo'), token);

        expect(result.offer).toEqual({ redeemed: true, reason: null });
        const state: MeBody = await me(result.accessToken);
        expect(state).toMatchObject({
            plan: 'premium',
            trial: { kind: 'no_card', daysLeft: 14 },
            offer: { trial: { kind: 'no_card', days: 14 } }
        });
        expect(state.offer?.rules).toHaveLength(1);
        expect(await counts(token)).toEqual({ redemptionCount: 1, trialCount: 1 });
        const marks = await pg.query<{ total: number }>(
            'SELECT count(*)::int AS total FROM "SignupEmailMarks" WHERE "signupLinkId" IS NOT NULL'
        );
        expect(marks.rows[0]?.total).toBeGreaterThanOrEqual(1);
        const company = await pg.query<{ trialStartedAt: Date | null }>('SELECT "trialStartedAt" FROM "Companies" WHERE id = $1', [
            result.user.companyId
        ]);
        expect(company.rows[0]?.trialStartedAt).not.toBeNull();
    });

    it('o mesmo e-mail (Gmail com ponto e +) não faz segundo teste, nem depois de a conta ser excluída; a recusa volta em offer.reason e a conta nasce Free', async () => {
        const base: string = `fulano${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
        const first: string = await seedLink({ kind: 'no_card', days: 7 });
        const second: string = await seedLink({ kind: 'no_card', days: 7 });
        const original: LoginBody = await login(`${base}@gmail.com`, first);
        expect(original.offer?.redeemed).toBe(true);

        await pg.query('DELETE FROM "Companies" WHERE id = $1', [original.user.companyId]);
        const again: LoginBody = await login(`${base.slice(0, 4)}.${base.slice(4)}+promo@gmail.com`, second);

        expect(again.offer).toEqual({ redeemed: false, reason: 'signup_links.email_already_used' });
        expect((await me(again.accessToken)).plan).toBe('free');
        expect(await counts(second)).toEqual({ redemptionCount: 0, trialCount: 0 });
    });

    it('e-mail não verificado não resgata teste sem cartão', async () => {
        const token: string = await seedLink({ kind: 'no_card', days: 7 });

        const result: LoginBody = await login(fresh('naoverificado'), token, false);

        expect(result.offer).toEqual({ redeemed: false, reason: 'signup_links.email_unverified' });
        expect((await me(result.accessToken)).plan).toBe('free');
    });

    it('conta Free existente resgata pelo POST, só uma vez, e a oferta só com desconto não abre teste', async () => {
        const token: string = await seedLink();
        const account: LoginBody = await login(fresh('free'));

        const redeemed: Response = await request('POST', '/billing/offer/redeem', { token }, account.accessToken);
        const again: Response = await request('POST', '/billing/offer/redeem', { token }, account.accessToken);

        expect(redeemed.status).toBe(200);
        expect(await redeemed.json()).toMatchObject({
            trial: { kind: 'none', days: null },
            rules: [{ percent: 50, fromCycle: 1, toCycle: 3 }]
        });
        expect(again.status).toBe(409);
        expect(((await again.json()) as ProblemBody).meta?.reason).toBe('already_redeemed');
        expect(await me(account.accessToken)).toMatchObject({ plan: 'free', trial: null, offer: { trial: { kind: 'none' } } });
        expect(await counts(token)).toEqual({ redemptionCount: 1, trialCount: 0 });
    });

    it('conta que já foi Premium ou já teve teste não resgata', async () => {
        const token: string = await seedLink();
        const paid: LoginBody = await login(fresh('pago'));
        await app.get(AppContext).run({ requestId: 'paid', locale: 'pt-BR', companyId: paid.user.companyId }, async () => {
            await app
                .get(PlanContractService, { strict: false })
                .open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        const trialed: LoginBody = await login(fresh('teste'));
        await pg.query('UPDATE "Companies" SET "trialStartedAt" = now() WHERE id = $1', [trialed.user.companyId]);

        const paidResponse: Response = await request('POST', '/billing/offer/redeem', { token }, paid.accessToken);
        const trialedResponse: Response = await request('POST', '/billing/offer/redeem', { token }, trialed.accessToken);

        expect(paidResponse.status).toBe(409);
        expect(((await paidResponse.json()) as ProblemBody).meta?.reason).toBe('already_paid');
        expect(trialedResponse.status).toBe(409);
        expect(((await trialedResponse.json()) as ProblemBody).meta?.reason).toBe('trial_used');
        expect(await counts(token)).toEqual({ redemptionCount: 0, trialCount: 0 });
    });

    it('link inexistente responde 404 no POST e sem sessão responde 401', async () => {
        const account: LoginBody = await login(fresh('sem-link'));

        const unknown: Response = await request('POST', '/billing/offer/redeem', { token: 'x'.repeat(32) }, account.accessToken);
        const anonymous: Response = await request('POST', '/billing/offer/redeem', { token: 'x'.repeat(32) });

        expect(unknown.status).toBe(404);
        expect(anonymous.status).toBe(401);
    });

    it('com o limite do link em 1 e dois cadastros ao mesmo tempo, só um resgata', async () => {
        const token: string = await seedLink({ kind: 'no_card', days: 7, maxUses: 1 });

        const [a, b] = await Promise.all([login(fresh('corrida-a'), token), login(fresh('corrida-b'), token)]);

        const redeemed: number = [a, b].filter((result: LoginBody) => result.offer?.redeemed === true).length;
        expect(redeemed).toBe(1);
        expect(await counts(token)).toEqual({ redemptionCount: 1, trialCount: 1 });
        const premium = await pg.query('SELECT count(*)::int AS total FROM "CompanyProducts" WHERE "companyId" = ANY($1)', [
            [a.user.companyId, b.user.companyId]
        ]);
        expect(premium.rows[0]).toEqual({ total: 1 });
    });

    it('limita os resgates por IP por dia', async () => {
        const token: string = await seedLink();
        const results: LoginBody[] = [];
        for (let attempt: number = 0; attempt <= IP_LIMIT; attempt += 1) {
            results.push(await login(fresh(`ip-${String(attempt)}`), token));
        }

        expect(results.slice(0, IP_LIMIT).every((result: LoginBody) => result.offer?.redeemed === true)).toBe(true);
        expect(results[IP_LIMIT]?.offer).toEqual({ redeemed: false, reason: 'signup_links.too_many_from_ip' });
        expect(await counts(token)).toEqual({ redemptionCount: IP_LIMIT, trialCount: 0 });
    });

    it('a exportação da conta inclui o resgate, sem rótulo nem token do link', async () => {
        const token: string = await seedLink();
        const account: LoginBody = await login(fresh('export'), token);

        const response: Response = await request('GET', '/account/export', undefined, account.accessToken);
        const body: string = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain('signup_offer');
        expect(body).toContain('"percent":50');
        expect(body).not.toContain(token);
        expect(body).not.toContain('Parceria');
    });

    it('a conta excluída leva o resgate (cascata) e a marca do e-mail não guarda o e-mail', async () => {
        const token: string = await seedLink({ kind: 'no_card', days: 7 });
        const email: string = fresh('apagar');
        const account: LoginBody = await login(email, token);

        await pg.query('DELETE FROM "Companies" WHERE id = $1', [account.user.companyId]);

        const redemptions = await pg.query('SELECT count(*)::int AS total FROM "SignupRedemptions" WHERE "companyId" = $1', [
            account.user.companyId
        ]);
        const marks = await pg.query<{ emailHash: string }>('SELECT "emailHash" FROM "SignupEmailMarks"');
        expect(redemptions.rows[0]).toEqual({ total: 0 });
        expect(marks.rows.some((row) => row.emailHash.includes(email) || row.emailHash === email)).toBe(false);
        expect(marks.rows.every((row) => /^[0-9a-f]{64}$/.test(row.emailHash))).toBe(true);
    });
});
