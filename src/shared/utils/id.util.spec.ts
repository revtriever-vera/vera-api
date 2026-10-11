import { describe, expect, it } from 'vitest';
import { IdUtil } from './id.util';

describe('IdUtil', () => {
    it('newId returns a valid, time-sortable uuid v7', () => {
        const id: string = IdUtil.newId();

        expect(IdUtil.isId(id)).toBe(true);
    });

    it('isId rejects a string that is not a uuid', () => {
        expect(IdUtil.isId('not-a-uuid')).toBe(false);
    });
});
