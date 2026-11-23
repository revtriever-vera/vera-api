import { describe, expect, it } from 'vitest';
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, generateLinkCode } from './link-code';

describe('generateLinkCode', () => {
    it('uses A-Z and 2-9 without I, O, 0 and 1', () => {
        expect(LINK_CODE_ALPHABET).toHaveLength(32);
        expect(LINK_CODE_ALPHABET).not.toMatch(/[IO01]/);
        expect(LINK_CODE_ALPHABET).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    });

    it('generates eight characters from the alphabet', () => {
        for (let run: number = 0; run < 200; run += 1) {
            const code: string = generateLinkCode();

            expect(code).toHaveLength(LINK_CODE_LENGTH);
            expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
        }
    });

    it('does not repeat across a few hundred draws', () => {
        const codes: Set<string> = new Set<string>();
        for (let run: number = 0; run < 300; run += 1) {
            codes.add(generateLinkCode());
        }

        expect(codes.size).toBe(300);
    });
});
