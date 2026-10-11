import { describe, expect, it, vi } from 'vitest';
import { ConnectionsApplication } from '../../application/connections.application';
import { CredentialsApplication } from '../../application/credentials.application';
import { ConnectionsController } from './connections.controller';
import { CredentialsController } from './credentials.controller';

const VIEW: Record<string, unknown> = {
    configured: true,
    clientIdHint: '3f9a…a5b6',
    status: 'valid',
    lastVerifiedAt: null,
    updatedAt: null
};

describe('CredentialsController', () => {
    function build(): { controller: CredentialsController; application: Record<string, ReturnType<typeof vi.fn>> } {
        const application: Record<string, ReturnType<typeof vi.fn>> = {
            get: vi.fn().mockResolvedValue(VIEW),
            save: vi.fn().mockResolvedValue(VIEW),
            test: vi.fn().mockResolvedValue(VIEW),
            remove: vi.fn().mockResolvedValue(undefined)
        };
        return { controller: new CredentialsController(application as unknown as CredentialsApplication), application };
    }

    it('delega leitura, gravação e teste à application', async () => {
        const { controller, application } = build();
        const body: { clientId: string; clientSecret: string } = { clientId: 'id', clientSecret: 'secret-secret-123' };

        expect(await controller.get()).toBe(VIEW);
        expect(await controller.save(body)).toBe(VIEW);
        expect(await controller.test()).toBe(VIEW);

        expect(application['save']).toHaveBeenCalledWith(body);
    });

    it('converte purgeTransactions em booleano ao remover', async () => {
        const { controller, application } = build();

        await controller.remove({ purgeTransactions: 'true' });
        await controller.remove({ purgeTransactions: 'false' });

        expect(application['remove']).toHaveBeenNthCalledWith(1, true);
        expect(application['remove']).toHaveBeenNthCalledWith(2, false);
    });
});

describe('ConnectionsController', () => {
    function build(): { controller: ConnectionsController; application: Record<string, ReturnType<typeof vi.fn>> } {
        const application: Record<string, ReturnType<typeof vi.fn>> = {
            overview: vi.fn().mockResolvedValue({ credentials: VIEW, connections: [] }),
            connect: vi.fn().mockResolvedValue({ results: [] }),
            disconnect: vi.fn().mockResolvedValue(undefined)
        };
        return { controller: new ConnectionsController(application as unknown as ConnectionsApplication), application };
    }

    it('lista, conecta e desconecta pela application', async () => {
        const { controller, application } = build();

        expect(await controller.overview()).toEqual({ credentials: VIEW, connections: [] });
        expect(await controller.connect({ itemIds: ['a'] })).toEqual({ results: [] });
        await controller.disconnect({ id: 'c1' }, { purgeTransactions: 'true' });

        expect(application['connect']).toHaveBeenCalledWith(['a']);
        expect(application['disconnect']).toHaveBeenCalledWith('c1', true);
    });
});
