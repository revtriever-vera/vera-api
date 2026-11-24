import { describe, expect, it } from 'vitest';
import { makeZip } from './fixtures/make-zip';
import { zipEntryContent } from './zip-archive';

function thrown(action: () => unknown): unknown {
    try {
        action();
    } catch (error: unknown) {
        return error;
    }
    return null;
}

describe('zipEntryContent', () => {
    const archive: Buffer = makeZip([
        { name: 'first.csv', content: Buffer.from('a;b\n1;2\n'), deflate: true },
        { name: 'second.csv', content: Buffer.from('c;d\n3;4\n'), deflate: false }
    ]);

    it('reads a deflated and a stored entry by name', () => {
        expect(zipEntryContent(archive, 'first.csv').toString()).toBe('a;b\n1;2\n');
        expect(zipEntryContent(archive, 'second.csv').toString()).toBe('c;d\n3;4\n');
    });

    it('rejects a missing entry, a non-zip body and a corrupt entry as an invalid format', () => {
        const corrupt: Buffer = Buffer.from(archive);
        corrupt.writeUInt32LE(0, 0);

        expect(thrown(() => zipEntryContent(archive, 'third.csv'))).toMatchObject({ errorCode: 'catalog.source_format_invalid' });
        expect(thrown(() => zipEntryContent(Buffer.from('<html>not found</html>'), 'first.csv'))).toMatchObject({
            errorCode: 'catalog.source_format_invalid'
        });
        expect(thrown(() => zipEntryContent(corrupt, 'first.csv'))).toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });
});
