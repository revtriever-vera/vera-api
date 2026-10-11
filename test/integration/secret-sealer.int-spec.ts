import { INestApplicationContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../src/core/context/context.module';
import { CryptoModule } from '../../src/core/crypto/crypto.module';
import { ResealableSecretsPort, SealedRecord } from '../../src/core/crypto/resealable-secrets.port';
import { sealedDriverOf } from '../../src/core/crypto/sealed-envelope';
import { SecretResealService } from '../../src/core/crypto/secret-reseal.service';
import { SecretSealerPort } from '../../src/core/crypto/secret-sealer.port';

const PURPOSE: string = 'int-purpose';
const COMPANY_A: string = '0198f2a0-0000-7000-8000-00000000000a';
const COMPANY_B: string = '0198f2a0-0000-7000-8000-00000000000b';

class InMemoryStore extends ResealableSecretsPort {
    public readonly purpose: string = PURPOSE;
    public readonly rows: Map<string, Map<string, string>> = new Map();
    public writes: number = 0;

    public listCompanyIds(): Promise<string[]> {
        return Promise.resolve([...this.rows.keys()]);
    }

    public listSealed(companyId: string): Promise<SealedRecord[]> {
        const rows: Map<string, string> = this.rows.get(companyId) ?? new Map();
        return Promise.resolve([...rows.entries()].map(([id, sealed]: [string, string]): SealedRecord => ({ id, sealed })));
    }

    public replaceSealed(companyId: string, id: string, sealed: string): Promise<void> {
        this.writes += 1;
        this.rows.get(companyId)?.set(id, sealed);
        return Promise.resolve();
    }
}

describe('secret sealer', () => {
    let app: INestApplicationContext;
    let sealer: SecretSealerPort;
    let store: InMemoryStore;

    beforeAll(async () => {
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['SECRET_SEALER_DRIVER'] = 'local';
        store = new InMemoryStore();
        const testing: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                ContextModule,
                CryptoModule
            ],
            providers: [{ provide: ResealableSecretsPort, useValue: store }]
        }).compile();
        app = await testing.createNestApplication().init();
        sealer = app.get(SecretSealerPort);
    });

    afterAll(async () => {
        await app.close();
    });

    it('is wired to the local driver without any cloud account', () => {
        expect(sealer.driver).toBe('local');
    });

    it('opens the secret sealed for company A only with the context of company A', async () => {
        const sealed: string = await sealer.seal('vera-int-secret', { companyId: COMPANY_A, purpose: PURPOSE });

        await expect(sealer.open(sealed, { companyId: COMPANY_A, purpose: PURPOSE })).resolves.toBe('vera-int-secret');
        await expect(sealer.open(sealed, { companyId: COMPANY_B, purpose: PURPOSE })).rejects.toMatchObject({
            code: 'core.secret_open_failed'
        });
        await expect(sealer.open(sealed, { companyId: COMPANY_A, purpose: 'other-purpose' })).rejects.toMatchObject({
            code: 'core.secret_open_failed'
        });
    });

    it('reseals idempotently through the discovered port', async () => {
        const reseal: SecretResealService = app.get(SecretResealService);
        store.rows.set(COMPANY_A, new Map([['1', await sealer.seal('a', { companyId: COMPANY_A, purpose: PURPOSE })]]));
        store.rows.set(COMPANY_B, new Map([['2', await sealer.seal('b', { companyId: COMPANY_B, purpose: PURPOSE })]]));

        await expect(reseal.run()).resolves.toEqual({ resealed: 0, skipped: 2 });
        expect(store.writes).toBe(0);
        expect(sealedDriverOf(store.rows.get(COMPANY_A)?.get('1') ?? '')).toBe('local');
    });
});
