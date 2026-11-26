import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { MemberRecipientsService } from '../../identity/services/member-recipients.service';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { NoticeUnsubscribeService } from './notice-unsubscribe.service';
import { NoticeTypeRegistry } from './notice-type.registry';
import { NoticesLogService } from './notices-log.service';

function setup() {
    const types: NoticeTypeRegistry = new NoticeTypeRegistry();
    types.register({ type: 'goal_behind', template: 'goal-behind' });
    types.register({ type: 'goal_late', template: 'goal-behind' });
    const preferences = { set: vi.fn().mockResolvedValue(undefined) };
    const recipients = { find: vi.fn().mockResolvedValue({ userId: 'ana' }) };
    const logs = { unsubscribed: vi.fn() };
    ContextHolder.set({
        get: vi.fn().mockReturnValue({ requestId: 'r' }),
        run: vi.fn().mockImplementation((_data: unknown, fn: () => unknown) => fn())
    } as unknown as AppContext);
    const service: NoticeUnsubscribeService = new NoticeUnsubscribeService(
        types,
        preferences as unknown as NoticePreferenceDomain,
        recipients as unknown as MemberRecipientsService,
        logs as unknown as NoticesLogService
    );
    return { service, preferences };
}

describe('NoticeUnsubscribeService', () => {
    it('turns off the one type of a single-type link', async () => {
        const { service, preferences }: ReturnType<typeof setup> = setup();

        await service.unsubscribe('company', { companyId: 'company', userId: 'ana', type: 'goal_behind' });

        expect(preferences.set.mock.calls).toEqual([['ana', 'goal_behind', false]]);
    });

    it('turns off every type of a grouped e-mail link', async () => {
        const { service, preferences }: ReturnType<typeof setup> = setup();

        await service.unsubscribe('company', { companyId: 'company', userId: 'ana', type: 'goal_behind,goal_late' });

        expect(preferences.set.mock.calls).toEqual([
            ['ana', 'goal_behind', false],
            ['ana', 'goal_late', false]
        ]);
    });

    it('refuses the link when any of its types is unknown and changes nothing', async () => {
        const { service, preferences }: ReturnType<typeof setup> = setup();

        await expect(service.unsubscribe('company', { companyId: 'company', userId: 'ana', type: 'goal_behind,nope' })).rejects.toThrow();
        expect(preferences.set).not.toHaveBeenCalled();
    });
});
