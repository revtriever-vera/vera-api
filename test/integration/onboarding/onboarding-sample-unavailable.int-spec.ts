import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { CompanyDomain } from '../../../src/modules/identity/domain/company.domain';
import { Company, User } from '../../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../../src/modules/identity/domain/user.domain';
import { SessionIssuerPort } from '../../../src/modules/identity/ports/session-issuer.port';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { withoutBusinessPorts } from '../support/inert-ports';
import { isolateRedisForWorker } from '../support/queue';

interface StateBody {
    readonly status: string;
    readonly sample: { readonly active: boolean; readonly available: boolean };
}

describe('onboarding sample data without registered ports', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let token: string;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('onboarding_sample_none');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await withoutBusinessPorts(Test.createTestingModule({ imports: [AppModule] })).compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;

        const context: AppContext = app.get(AppContext);
        const inCompany = async <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
            context.run({ requestId: 'test', companyId, locale: 'pt-BR' }, fn);
        const company: Company = await app.get(CompanyDomain, { strict: false }).create({ name: 'Empresa', locale: 'pt-BR' });
        const user: User = await inCompany(company.id, async () =>
            app.get(UserDomain, { strict: false }).createOwner({
                email: `none-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens = await inCompany(company.id, async () =>
            app.get(SessionIssuerPort, { strict: false }).issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        token = tokens.accessToken;
    });

    afterAll(async () => {
        await app.close();
        await isolated.drop();
    });

    const call = async (method: 'GET' | 'POST' | 'DELETE', path: string): Promise<Response> =>
        fetch(`${origin}/onboarding${path}`, { method, headers: { authorization: `Bearer ${token}` } });

    it('GET informa sample.available false', async () => {
        const body = (await (await call('GET', '')).json()) as StateBody;

        expect(body.sample).toEqual({ active: false, available: false });
    });

    it('POST responde 409 onboarding.sample_unavailable e não fecha o onboarding', async () => {
        const response: Response = await call('POST', '/sample');

        expect(response.status).toBe(409);
        expect(((await response.json()) as { type: string }).type).toBe('onboarding.sample_unavailable');
        expect(((await (await call('GET', '')).json()) as StateBody).status).toBe('welcome');
    });

    it('DELETE responde 200 sem efeito', async () => {
        const response: Response = await call('DELETE', '/sample');

        expect(response.status).toBe(200);
        expect(((await response.json()) as StateBody).sample).toEqual({ active: false, available: false });
    });
});
