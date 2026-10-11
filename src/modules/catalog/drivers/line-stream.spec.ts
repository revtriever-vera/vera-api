import { describe, expect, it } from 'vitest';
import { cell, columnIndexes, linesOf } from './line-stream';

async function collect(response: Response, encoding: string = 'utf-8'): Promise<string[]> {
    const lines: string[] = [];
    for await (const line of linesOf(response, encoding)) {
        lines.push(line);
    }
    return lines;
}

function streamOf(chunks: readonly Uint8Array[], failAfter?: Error): Response {
    const stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
        start(controller: ReadableStreamDefaultController<Uint8Array>): void {
            for (const chunk of chunks) {
                controller.enqueue(chunk);
            }
            if (failAfter) {
                controller.error(failAfter);
                return;
            }
            controller.close();
        }
    });
    return new Response(stream);
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('linesOf', () => {
    it('joins lines split across chunks and accepts CRLF and a missing final newline', async () => {
        const response: Response = streamOf([encode('a;b\r\nc;'), encode('d\ne;f')]);

        expect(await collect(response)).toEqual(['a;b', 'c;d', 'e;f']);
    });

    it('decodes the declared encoding', async () => {
        const latin1: Uint8Array = Uint8Array.from([0x41, 0xe7, 0xe3, 0x6f, 0x0a]);

        expect(await collect(streamOf([latin1]), 'windows-1252')).toEqual(['Ação']);
    });

    it('fails with a format error when the response has no body', async () => {
        await expect(collect(new Response(null, { status: 200 }))).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('fails with an unreachable error when the stream breaks midway', async () => {
        await expect(collect(streamOf([encode('a\n')], new Error('socket fechou')))).rejects.toMatchObject({
            errorCode: 'catalog.source_unreachable'
        });
    });
});

describe('columnIndexes and cell', () => {
    it('indexes the header ignoring a leading BOM and reads trimmed cells', () => {
        const indexes: ReadonlyMap<string, number> = columnIndexes('﻿A ; B;C', ['A', 'C']);

        expect(cell(['x', ' y ', 'z'], indexes, 'B')).toBe('y');
        expect(cell(['x'], indexes, 'C')).toBe('');
        expect(cell(['x'], indexes, 'Z')).toBe('');
    });

    it('fails when a required column is missing', () => {
        expect(() => columnIndexes('A;B', ['C'])).toThrowError('catalog.source_format_invalid');
    });
});
