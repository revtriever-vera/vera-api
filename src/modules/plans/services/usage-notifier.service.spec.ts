import { describe, expect, it, vi } from 'vitest';
import { OwnerRecipientsService } from '../../identity/services/owner-recipients.service';
import { UsageNotifier } from './usage-notifier.service';

function build(owners: object[]) {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const notifier: UsageNotifier = new UsageNotifier({ enqueue }, {
        list: vi.fn().mockResolvedValue(owners)
    } as unknown as OwnerRecipientsService);
    return { notifier, enqueue };
}

const OWNER = { userId: 'u1', email: 'ana@example.com', firstName: 'Ana', locale: 'pt-BR' };

describe('UsageNotifier', () => {
    it('manda o aviso de 80% a cada dono com a referência por pessoa', async () => {
        const { notifier, enqueue } = build([OWNER, { ...OWNER, userId: 'u2', email: 'bia@example.com', locale: 'en' }]);

        const sent: number = await notifier.notify({ companyId: 'c1', period: '2026-10', kind: 'warning', usedBps: 8523 });

        expect(sent).toBe(2);
        expect(enqueue).toHaveBeenNthCalledWith(1, {
            template: 'usage-warning',
            locale: 'pt-BR',
            props: { firstName: 'Ana', percent: '85', month: 'outubro', resetMonth: 'novembro' },
            to: { email: 'ana@example.com', name: 'Ana' },
            reference: 'c1-2026-10-warning-u1'
        });
        expect(enqueue).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ locale: 'en', props: expect.objectContaining({ month: 'October', resetMonth: 'November' }) })
        );
    });

    it('a pausa usa o outro template e dezembro vira janeiro', async () => {
        const { notifier, enqueue } = build([OWNER]);

        await notifier.notify({ companyId: 'c1', period: '2026-12', kind: 'paused', usedBps: 10000 });

        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                template: 'usage-paused',
                props: expect.objectContaining({ percent: '100', month: 'dezembro', resetMonth: 'janeiro' })
            })
        );
    });

    it('sem dono não manda nada', async () => {
        const { notifier, enqueue } = build([]);

        expect(await notifier.notify({ companyId: 'c1', period: '2026-10', kind: 'warning', usedBps: 8000 })).toBe(0);
        expect(enqueue).not.toHaveBeenCalled();
    });
});
