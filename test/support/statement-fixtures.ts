import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function fixture(name: string): Buffer {
    return readFileSync(join(process.cwd(), 'test', 'fixtures', 'statements', name));
}
