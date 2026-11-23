import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { CompanyDomain } from '../domain/company.domain';
import { PlatformSeedRefusedError } from '../domain/identity.errors';
import { UserDomain } from '../domain/user.domain';
import { PlatformAvailabilityService } from './platform-availability.service';
import { PlatformSeedService } from './platform-seed.service';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);
TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);

interface Harness {
    readonly service: PlatformSeedService;
    readonly createPlatform: ReturnType<typeof vi.fn>;
    readonly findPlatform: ReturnType<typeof vi.fn>;
    readonly createOwner: ReturnType<typeof vi.fn>;
    readonly findByEmail: ReturnType<typeof vi.fn>;
}

function build(enabled: boolean = true): Harness {
    const createPlatform: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'company-sys' });
    const findPlatform: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
    const createOwner: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'user-1' });
    const findByEmail: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
    const service: PlatformSeedService = new PlatformSeedService(
        { enabled: () => enabled } as unknown as PlatformAvailabilityService,
        { createPlatform, findPlatform } as unknown as CompanyDomain,
        { createOwner, findByEmailAcrossTenants: findByEmail } as unknown as UserDomain
    );
    return { service, createPlatform, findPlatform, createOwner, findByEmail };
}

const run = <T>(fn: () => Promise<T>): Promise<T> => context.run({ requestId: 'seed', locale: 'pt-BR' }, fn);

describe('PlatformSeedService', () => {
    let harness: Harness;

    beforeEach(() => {
        harness = build();
    });

    it('cria a company de sistema e o usuário verificado com o e-mail normalizado', async () => {
        expect(await run(async () => harness.service.seed('  Admin.Teste@Example.test '))).toBe('created');

        expect(harness.createPlatform).toHaveBeenCalledWith('Vera (sistema)');
        expect(harness.createOwner).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'admin.teste@example.test', emailVerifiedAt: expect.any(Date) as Date })
        );
    });

    it('com a company já criada, só acrescenta o usuário', async () => {
        harness.findPlatform.mockResolvedValue({ id: 'company-sys' });

        await run(async () => harness.service.seed('outro@example.test'));

        expect(harness.createPlatform).not.toHaveBeenCalled();
        expect(harness.createOwner).toHaveBeenCalledTimes(1);
    });

    it('usuário que já existe: não faz nada', async () => {
        harness.findByEmail.mockResolvedValue({ id: 'user-1' });

        expect(await run(async () => harness.service.seed('admin@example.test'))).toBe('unchanged');
        expect(harness.createPlatform).not.toHaveBeenCalled();
        expect(harness.createOwner).not.toHaveBeenCalled();
    });

    it('recusa na auto-hospedada e sem e-mail', async () => {
        await expect(run(async () => build(false).service.seed('admin@example.test'))).rejects.toBeInstanceOf(PlatformSeedRefusedError);
        await expect(run(async () => harness.service.seed('   '))).rejects.toBeInstanceOf(PlatformSeedRefusedError);
        expect(harness.createPlatform).not.toHaveBeenCalled();
    });
});
