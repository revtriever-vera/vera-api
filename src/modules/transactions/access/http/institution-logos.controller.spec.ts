import { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AccountApplication } from '../../application/account.application';
import { InstitutionLogoNotFoundError } from '../../domain/transactions.errors';
import { InstitutionLogosController } from './institution-logos.controller';

function build(logo: ReturnType<typeof vi.fn>): { controller: InstitutionLogosController; setHeader: ReturnType<typeof vi.fn> } {
    const setHeader: ReturnType<typeof vi.fn> = vi.fn();
    return { controller: new InstitutionLogosController({ logo } as unknown as AccountApplication), setHeader };
}

describe('InstitutionLogosController', () => {
    it('manda o cache público só quando a logo existe', async () => {
        const { controller, setHeader } = build(vi.fn().mockResolvedValue({ content: Buffer.from([1, 2]), contentType: 'image/png' }));

        await controller.logo({ token: 't' }, { setHeader } as unknown as Response);

        expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
    });

    it('não marca a falha como cacheável', async () => {
        const { controller, setHeader } = build(vi.fn().mockRejectedValue(new InstitutionLogoNotFoundError()));

        await expect(controller.logo({ token: 't' }, { setHeader } as unknown as Response)).rejects.toMatchObject({
            code: 'transactions.logo_not_found'
        });
        expect(setHeader).not.toHaveBeenCalled();
    });
});
