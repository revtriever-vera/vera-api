import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { beforeAll, describe, expect, it } from 'vitest';
import { ContextHolder } from '../context/as-company.decorator';
import { AlsAppContext } from '../context/als-app-context';
import { LocalSecretSealerDriver } from './drivers/local-secret-sealer.driver';
import { ResealableSecretsPort, SealedRecord } from './resealable-secrets.port';
import { sealedDriverOf } from './sealed-envelope';
import { SecretResealService } from './secret-reseal.service';
import { SecretSealerPort } from './secret-sealer.port';

const PURPOSE: string = 'test-purpose';

class FakeStore extends ResealableSecretsPort {
    public readonly purpose: string = PURPOSE;
    public readonly rows: Map<string, Map<string, string>> = new Map();
    public writes: number = 0;

    public listCompanyIds(): Promise<string[]> {
        return Promise.resolve([...this.rows.keys()]);
    }

    public listSealed(companyId: string): Promise<SealedRecord[]> {
        return Promise.resolve(
            [...(this.rows.get(companyId) ?? new Map()).entries()].map(([id, sealed]: [string, string]) => ({ id, sealed }))
        );
    }

    public replaceSealed(companyId: string, id: string, sealed: string): Promise<void> {
        this.writes += 1;
        this.rows.get(companyId)?.set(id, sealed);
        return Promise.resolve();
    }
}

function fakeKmsLikeSealer(local: LocalSecretSealerDriver): SecretSealerPort {
    return {
        driver: 'kms',
        seal: async (plain: string, context) => {
            const inner: string = await local.seal(plain, context);
            const envelope = JSON.parse(Buffer.from(inner, 'base64url').toString()) as Record<string, unknown>;
            return Buffer.from(JSON.stringify({ ...envelope, d: 'kms', e: 'ZGVr' })).toString('base64url');
        },
        open: async (sealed: string, context) => {
            const envelope = JSON.parse(Buffer.from(sealed, 'base64url').toString()) as Record<string, unknown>;
            const { e: _wrapped, ...rest } = envelope;
            return local.open(Buffer.from(JSON.stringify({ ...rest, d: 'local' })).toString('base64url'), context);
        }
    };
}

function discoveryOf(...ports: ResealableSecretsPort[]): DiscoveryService {
    const wrappers: InstanceWrapper[] = [...ports, { unrelated: true }].map((instance: object) => ({ instance }) as InstanceWrapper);
    return { getProviders: (): InstanceWrapper[] => wrappers } as unknown as DiscoveryService;
}

describe('SecretResealService', () => {
    beforeAll(() => {
        ContextHolder.set(new AlsAppContext());
    });

    it('reseals local secrets with the configured driver and is idempotent', async () => {
        const local: LocalSecretSealerDriver = new LocalSecretSealerDriver('a'.repeat(64));
        const sealer: SecretSealerPort = fakeKmsLikeSealer(local);
        const store: FakeStore = new FakeStore();
        store.rows.set('company-a', new Map([['1', await local.seal('secret-a', { companyId: 'company-a', purpose: PURPOSE })]]));
        store.rows.set('company-b', new Map([['2', await local.seal('secret-b', { companyId: 'company-b', purpose: PURPOSE })]]));
        const service: SecretResealService = new SecretResealService(discoveryOf(store), sealer);

        await expect(service.run()).resolves.toEqual({ resealed: 2, skipped: 0 });
        expect(sealedDriverOf(store.rows.get('company-a')?.get('1') ?? '')).toBe('kms');
        await expect(sealer.open(store.rows.get('company-b')?.get('2') ?? '', { companyId: 'company-b', purpose: PURPOSE })).resolves.toBe(
            'secret-b'
        );

        await expect(service.run()).resolves.toEqual({ resealed: 0, skipped: 2 });
        expect(store.writes).toBe(2);
    });

    it('does nothing when no port is registered', async () => {
        const service: SecretResealService = new SecretResealService(
            discoveryOf(),
            fakeKmsLikeSealer(new LocalSecretSealerDriver('a'.repeat(64)))
        );

        await expect(service.run()).resolves.toEqual({ resealed: 0, skipped: 0 });
    });
});
