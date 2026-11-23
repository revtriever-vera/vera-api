import { describe, expect, it } from 'vitest';
import { NoticeTypeRegistry } from '../../notices/services/notice-type.registry';
import { GoalBehindNoticeRegistrar } from './goal-behind-notice.registrar';

describe('GoalBehindNoticeRegistrar', () => {
    it('registra o tipo goal_behind com o template goal-behind', () => {
        const registry: NoticeTypeRegistry = new NoticeTypeRegistry();

        new GoalBehindNoticeRegistrar(registry).onModuleInit();

        expect(registry.require('goal_behind')).toEqual({ type: 'goal_behind', template: 'goal-behind' });
    });
});
