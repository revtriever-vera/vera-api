import { describe, expect, it } from 'vitest';
import { UnknownNoticeTypeError } from '../domain/notices.errors';
import { NoticeTypeRegistry } from './notice-type.registry';

describe('NoticeTypeRegistry', () => {
    it('lists the registered types sorted and knows which exist', () => {
        const registry: NoticeTypeRegistry = new NoticeTypeRegistry();
        registry.register({ type: 'recurring_week', template: 'recurring-week' });
        registry.register({ type: 'goal_behind', template: 'goal-behind' });

        expect(registry.types()).toEqual(['goal_behind', 'recurring_week']);
        expect(registry.has('goal_behind')).toBe(true);
        expect(registry.has('other')).toBe(false);
        expect(registry.require('goal_behind').template).toBe('goal-behind');
    });

    it('fails loud for a type nobody registered', () => {
        expect(() => new NoticeTypeRegistry().require('other')).toThrow(UnknownNoticeTypeError);
    });
});
