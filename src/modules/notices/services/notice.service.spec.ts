import { describe, expect, it, vi } from 'vitest';
import { EnqueueMailRequest } from '../../../core/mail/mailer.port';
import { AppContext } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { MemberRecipient, MemberRecipientsService } from '../../identity/services/member-recipients.service';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { NoticeSendDomain } from '../domain/notice-send.domain';
import { NoticeOutcome } from '../domain/notices.types';
import { NoticeService } from './notice.service';
import { NoticeTypeRegistry } from './notice-type.registry';
import { NoticesLogService } from './notices-log.service';
import { UnsubscribeLinkService } from './unsubscribe-link.service';

const ANA: MemberRecipient = { userId: 'ana', email: 'ana@example.com', firstName: 'Ana', locale: 'pt-BR' };
const BOB: MemberRecipient = { userId: 'bob', email: 'bob@example.com', firstName: 'Bob', locale: 'en' };

function setup(
    options: { disabled?: string[]; disabledByType?: Record<string, string[]>; claimed?: (string | null)[]; enqueueFails?: boolean } = {}
) {
    const types: NoticeTypeRegistry = new NoticeTypeRegistry();
    types.register({ type: 'goal_behind', template: 'goal-behind' });
    types.register({ type: 'goal_late', template: 'goal-behind' });
    const claims: (string | null)[] = [...(options.claimed ?? [])];
    const sends = {
        claim: vi.fn().mockImplementation(() => Promise.resolve(claims.shift() ?? null)),
        release: vi.fn().mockResolvedValue(undefined)
    };
    const mailer = {
        enqueue: vi.fn().mockImplementation(() => (options.enqueueFails ? Promise.reject(new Error('down')) : Promise.resolve()))
    };
    const recipients = {
        list: vi.fn().mockResolvedValue([ANA, BOB]),
        find: vi.fn().mockImplementation((id: string) => Promise.resolve([ANA, BOB].find((person) => person.userId === id) ?? null))
    };
    const logs = { sent: vi.fn(), released: vi.fn() };
    const links = {
        urlFor: vi
            .fn()
            .mockImplementation((subject: { type: string }) => `https://api.vera.example/notifications/unsubscribe/${subject.type}`)
    };
    const preferences = {
        disabledUserIds: vi
            .fn()
            .mockImplementation((type: string) => Promise.resolve(new Set(options.disabledByType?.[type] ?? options.disabled ?? [])))
    };
    const context = {
        get: vi.fn().mockReturnValue({ requestId: 'r' }),
        run: vi.fn().mockImplementation((_data: unknown, fn: () => unknown) => fn())
    };
    ContextHolder.set(context as unknown as AppContext);
    const service: NoticeService = new NoticeService(
        types,
        preferences as unknown as NoticePreferenceDomain,
        sends as unknown as NoticeSendDomain,
        recipients as unknown as MemberRecipientsService,
        mailer,
        links as unknown as UnsubscribeLinkService,
        logs as unknown as NoticesLogService
    );
    return { service, sends, mailer, recipients, logs };
}

describe('NoticeService', () => {
    it('enqueues one e-mail per person with the unsubscribe link, the locale of the person and a reference of the notice', async () => {
        const { service, mailer }: ReturnType<typeof setup> = setup({ claimed: ['n1', 'n2'] });

        const outcome: NoticeOutcome = await service.notify('company', { type: 'goal_behind', key: '2026-12', props: { goal: 'Reserva' } });

        expect(outcome).toEqual({ sent: 2, skipped: 0 });
        expect(mailer.enqueue).toHaveBeenNthCalledWith(1, {
            template: 'goal-behind',
            locale: 'pt-BR',
            props: { goal: 'Reserva', firstName: 'Ana', unsubscribeUrl: 'https://api.vera.example/notifications/unsubscribe/goal_behind' },
            to: { email: 'ana@example.com', name: 'Ana' },
            unsubscribeUrl: 'https://api.vera.example/notifications/unsubscribe/goal_behind',
            reference: 'goal_behind-n1'
        });
        expect(mailer.enqueue.mock.calls[1]?.[0]).toMatchObject({ locale: 'en', reference: 'goal_behind-n2' });
    });

    it('does not claim or send for who turned the type off, and counts a repeated key as skipped', async () => {
        const { service, sends, mailer }: ReturnType<typeof setup> = setup({ disabled: ['ana'], claimed: [null] });

        const outcome: NoticeOutcome = await service.notify('company', { type: 'goal_behind', key: 'k', props: {} });

        expect(outcome).toEqual({ sent: 0, skipped: 1 });
        expect(sends.claim).toHaveBeenCalledTimes(1);
        expect(sends.claim).toHaveBeenCalledWith('bob', 'goal_behind', 'k');
        expect(mailer.enqueue).not.toHaveBeenCalled();
    });

    it('targets only the person asked and nobody when they are not in the account', async () => {
        const { service, recipients, mailer }: ReturnType<typeof setup> = setup({ claimed: ['n1'] });

        const one: NoticeOutcome = await service.notify('company', { type: 'goal_behind', key: 'k', props: {}, userId: 'bob' });
        const none: NoticeOutcome = await service.notify('company', { type: 'goal_behind', key: 'k', props: {}, userId: 'ghost' });

        expect(one).toEqual({ sent: 1, skipped: 0 });
        expect(none).toEqual({ sent: 0, skipped: 0 });
        expect(recipients.list).not.toHaveBeenCalled();
        expect(mailer.enqueue).toHaveBeenCalledTimes(1);
    });

    it('releases the claim and rethrows when the e-mail cannot be enqueued', async () => {
        const { service, sends, logs }: ReturnType<typeof setup> = setup({ claimed: ['n1'], enqueueFails: true });

        await expect(service.notify('company', { type: 'goal_behind', key: 'k', props: {}, userId: 'ana' })).rejects.toThrow('down');

        expect(sends.release).toHaveBeenCalledWith('n1');
        expect(logs.released).toHaveBeenCalledWith('goal_behind', 'n1', expect.any(Error));
        expect(logs.sent).not.toHaveBeenCalled();
    });

    it('refuses a type nobody registered', async () => {
        const { service }: ReturnType<typeof setup> = setup();

        await expect(service.notify('company', { type: 'nope', key: 'k', props: {} })).rejects.toThrow('notices.unknown_type');
    });

    it('sends one digest e-mail per person with every entry, the link of each type and a reference of the first notice', async () => {
        const { service, mailer, sends }: ReturnType<typeof setup> = setup({ claimed: ['a1', 'a2', 'b1', 'b2'] });

        const outcome: NoticeOutcome = await service.notifyDigest('company', {
            entries: [
                { type: 'goal_behind', key: 'goal_behind:x:2026-12-01', data: { name: 'X' } },
                { type: 'goal_late', key: 'goal_late:y:2026-12-02', data: { name: 'Y' } }
            ],
            props: { extra: '1' }
        });

        expect(outcome).toEqual({ sent: 2, skipped: 0 });
        expect(sends.claim).toHaveBeenCalledTimes(4);
        expect(mailer.enqueue).toHaveBeenCalledTimes(2);
        const first = mailer.enqueue.mock.calls[0]?.[0] as EnqueueMailRequest;
        expect(first).toMatchObject({
            template: 'goal-behind',
            locale: 'pt-BR',
            reference: 'goal_behind-a1',
            to: { email: 'ana@example.com' }
        });
        expect(JSON.parse(first.props['entries'] ?? '[]')).toEqual([
            { type: 'goal_behind', name: 'X' },
            { type: 'goal_late', name: 'Y' }
        ]);
        expect(JSON.parse(first.props['unsubscribeUrls'] ?? '{}')).toEqual({
            goal_behind: 'https://api.vera.example/notifications/unsubscribe/goal_behind',
            goal_late: 'https://api.vera.example/notifications/unsubscribe/goal_late'
        });
        expect(first.props).toMatchObject({ extra: '1', firstName: 'Ana' });
    });

    it('leaves out the types a person turned off and sends nothing when every entry was already sent', async () => {
        const { service, mailer, sends }: ReturnType<typeof setup> = setup({
            disabledByType: { goal_late: ['ana'] },
            claimed: [null, 'b1', null]
        });

        const outcome: NoticeOutcome = await service.notifyDigest('company', {
            entries: [
                { type: 'goal_behind', key: 'k1', data: {} },
                { type: 'goal_late', key: 'k2', data: {} }
            ],
            props: {}
        });

        expect(outcome).toEqual({ sent: 1, skipped: 1 });
        expect(sends.claim).toHaveBeenCalledWith('ana', 'goal_behind', 'k1');
        expect(sends.claim).not.toHaveBeenCalledWith('ana', 'goal_late', 'k2');
        expect(mailer.enqueue).toHaveBeenCalledTimes(1);
        expect(mailer.enqueue.mock.calls[0]?.[0]).toMatchObject({ to: { email: 'bob@example.com' } });
    });

    it('releases every claim of the digest and rethrows when the e-mail cannot be enqueued', async () => {
        const { service, sends }: ReturnType<typeof setup> = setup({ claimed: ['a1', 'a2'], enqueueFails: true });

        await expect(
            service.notifyDigest('company', {
                entries: [
                    { type: 'goal_behind', key: 'k1', data: {} },
                    { type: 'goal_late', key: 'k2', data: {} }
                ],
                props: {}
            })
        ).rejects.toThrow('down');

        expect(sends.release).toHaveBeenCalledWith('a1');
        expect(sends.release).toHaveBeenCalledWith('a2');
    });

    it('refuses a digest with a type nobody registered', async () => {
        const { service }: ReturnType<typeof setup> = setup();

        await expect(service.notifyDigest('company', { entries: [{ type: 'nope', key: 'k', data: {} }], props: {} })).rejects.toThrow(
            'notices.unknown_type'
        );
    });
});
