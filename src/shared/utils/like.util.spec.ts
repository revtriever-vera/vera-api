import { describe, expect, it } from 'vitest';
import { escapeLike, likePattern } from './like.util';

describe('like.util', () => {
    it('escapes the LIKE wildcards and the escape character', () => {
        expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    });

    it('leaves text without wildcards untouched', () => {
        expect(escapeLike('abc')).toBe('abc');
    });

    it('wraps the escaped text for a contains search', () => {
        expect(likePattern('a_b')).toBe('%a\\_b%');
    });
});
