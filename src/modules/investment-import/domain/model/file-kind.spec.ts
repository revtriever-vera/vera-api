import { describe, expect, it } from 'vitest';
import { modelFileKindOf } from './file-kind';

function bytesOf(...values: number[]): Uint8Array {
    return new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

describe('modelFileKindOf', () => {
    it.each([
        ['pdf', bytesOf(0x25, 0x50, 0x44, 0x46)],
        ['png', bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
        ['jpeg', bytesOf(0xff, 0xd8, 0xff, 0xe0)],
        ['webp', bytesOf(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)],
        ['heic', bytesOf(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63)]
    ])('reconhece %s pelos primeiros bytes', (kind: string, bytes: Uint8Array) => {
        expect(modelFileKindOf(bytes)).toBe(kind);
    });

    it('não confunde planilha, texto nem GIF com algo que vai ao modelo', () => {
        expect(modelFileKindOf(bytesOf(0x50, 0x4b, 3, 4))).toBeNull();
        expect(modelFileKindOf(new TextEncoder().encode('Data do Negócio;Tipo'))).toBeNull();
        expect(modelFileKindOf(bytesOf(0x47, 0x49, 0x46, 0x38))).toBeNull();
        expect(modelFileKindOf(new Uint8Array())).toBeNull();
    });
});
