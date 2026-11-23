import { describe, expect, it } from 'vitest';
import { linkTextOf, parseLinkMessage } from './link-message';

describe('parseLinkMessage', () => {
    it.each([
        ['VINCULAR ABC23XYZ', 'ABC23XYZ'],
        ['VINCULAR abc23xyz', 'ABC23XYZ'],
        ['vincular  ABC23XYZ.', 'ABC23XYZ'],
        ['  Vincular\tabc23xyz!  ', 'ABC23XYZ'],
        ['VINCULAR ABC23XYZ ...', 'ABC23XYZ']
    ])('reads the code of %j', (text: string, code: string) => {
        expect(parseLinkMessage(text)).toBe(code);
    });

    it.each([
        'oi',
        'VINCULAR',
        'VINCULAR ABC23XY',
        'VINCULAR ABC23XYZ1',
        'VINCULAR ABCIO0XY',
        'quero VINCULAR ABC23XYZ',
        'VINCULARABC23XYZ',
        'VINCULAR ABC23XYZ obrigado'
    ])('ignores %j', (text: string) => {
        expect(parseLinkMessage(text)).toBeNull();
    });

    it('builds the text the wa.me link carries', () => {
        expect(linkTextOf('ABC23XYZ')).toBe('VINCULAR ABC23XYZ');
        expect(parseLinkMessage(linkTextOf('ABC23XYZ'))).toBe('ABC23XYZ');
    });
});
