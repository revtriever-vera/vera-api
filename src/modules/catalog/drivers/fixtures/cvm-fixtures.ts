import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeZip } from './make-zip';

export function fixtureText(name: string): Buffer {
    return Buffer.from(readFileSync(join(__dirname, 'cvm', name), 'utf-8'), 'latin1');
}

export function fixtureZip(entry: string, fixture: string): Buffer {
    return makeZip([{ name: entry, content: fixtureText(fixture), deflate: true }]);
}

export function zipResponse(body: Buffer, headers: Record<string, string> = {}): Response {
    return new Response(new Uint8Array(body), { status: 200, headers });
}
