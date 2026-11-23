import { describe, expect, it } from 'vitest';
import { stripTrailingPunctuation } from './text-normalizer';

describe('stripTrailingPunctuation', () => {
    it('removes trailing punctuation and spaces only', () => {
        expect(stripTrailingPunctuation('sair!?. ')).toBe('sair');
        expect(stripTrailingPunctuation('a.b')).toBe('a.b');
        expect(stripTrailingPunctuation('...')).toBe('');
    });
});
