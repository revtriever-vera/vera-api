import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { CompanyDomain } from '../../../src/modules/identity/domain/company.domain';
import { Company, User } from '../../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../../src/modules/identity/ports/session-issuer.port';
import { createIsolatedDatabase, IsolatedDatabase } from './isolated-database';
import { isolateRedisForWorker } from './queue';

export interface Account {
    readonly company: Company;
    readonly user: User;
    readonly token: string;
}

export interface ApiResponse<T> {
    readonly status: number;
    readonly body: T;
}

export class AllocationHarness {
    public constructor(
        public readonly app: INestApplication,
        public readonly pg: Client,
        private readonly origin: string,
        private readonly isolated: IsolatedDatabase
    ) {}

    public static async start(label: string): Promise<AllocationHarness> {
        const isolated: IsolatedDatabase = await createIsolatedDatabase(label);
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        const app: INestApplication = testing.createNestApplication();
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        const pg: Client = new Client({ connectionString: isolated.url });
        await pg.connect();
        return new AllocationHarness(app, pg, `http://127.0.0.1:${String(address.port)}`, isolated);
    }

    public async stop(): Promise<void> {
        await this.pg.end();
        await this.app.close();
        await this.isolated.drop();
    }

    public async inCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
        return this.app.get(AppContext).run({ requestId: 'test', companyId, locale: 'pt-BR' }, fn);
    }

    public async signUp(label: string): Promise<Account> {
        const companies: CompanyDomain = this.app.get(CompanyDomain, { strict: false });
        const users: UserDomain = this.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = this.app.get(SessionIssuerPort, { strict: false });
        const company: Company = await companies.create({ name: `Empresa ${label}` });
        const user: User = await this.inCompany(company.id, async () =>
            users.createOwner({
                email: `${label}-${crypto.randomUUID()}@example.com`,
                name: `Pessoa ${label}`,
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await this.inCompany(company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        return { company, user, token: tokens.accessToken };
    }

    public async call<T>(token: string | null, method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) {
            headers['authorization'] = `Bearer ${token}`;
        }
        const response: Response = await fetch(`${this.origin}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text: string = await response.text();
        return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : null) as T };
    }
}
