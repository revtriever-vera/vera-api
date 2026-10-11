import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { UnauthorizedError } from '../domain/identity.errors';
import { User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { CurrentUserService } from './current-user.service';

const USER: User = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'ana@example.com',
    name: 'Ana',
    role: 'owner',
    locale: null,
    emailVerifiedAt: null,
    termsAcceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
};

describe('CurrentUserService', () => {
    const context: AlsAppContext = new AlsAppContext();

    it('devolve o usuário do contexto', async () => {
        const findById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(USER);
        const service: CurrentUserService = new CurrentUserService({ findById } as unknown as UserDomain, context);

        const user: User = await context.run({ requestId: 'r', locale: 'pt-BR', userId: 'user-1' }, async () => service.require());

        expect(user).toBe(USER);
        expect(findById).toHaveBeenCalledWith('user-1');
    });

    it('lança unauthorized sem usuário no contexto', async () => {
        const findById: ReturnType<typeof vi.fn> = vi.fn();
        const service: CurrentUserService = new CurrentUserService({ findById } as unknown as UserDomain, context);

        await expect(context.run({ requestId: 'r', locale: 'pt-BR' }, async () => service.require())).rejects.toBeInstanceOf(
            UnauthorizedError
        );
        expect(findById).not.toHaveBeenCalled();
    });

    it('lança unauthorized quando o usuário foi apagado', async () => {
        const service: CurrentUserService = new CurrentUserService(
            { findById: vi.fn().mockResolvedValue(null) } as unknown as UserDomain,
            context
        );

        await expect(
            context.run({ requestId: 'r', locale: 'pt-BR', userId: 'user-1' }, async () => service.require())
        ).rejects.toBeInstanceOf(UnauthorizedError);
    });
});
