import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateAllFixtures, GeneratedFiles } from './generate';

const OUTPUT_DIR: string = join(__dirname, '..', 'generated');

async function main(): Promise<void> {
    const files: GeneratedFiles = await generateAllFixtures();
    files.forEach((content: Buffer, relativePath: string): void => {
        const target: string = join(OUTPUT_DIR, relativePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
        console.log(target);
    });
}

main().catch((error: unknown): void => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
