import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createGateway, generateText } from 'ai';

const MODEL_ID: string = 'meta/muse-spark-1.3-contributor';
const MEDIA_TYPES: Readonly<Record<string, string>> = { '.png': 'image/png', '.pdf': 'application/pdf' };
const PROMPT: string =
    'Extract every trade from this brokerage note. Answer only with JSON {"date":"YYYY-MM-DD","trades":[{"side":"buy|sell","ticker":"","quantity":0,"unitPrice":0}]}.';
const EXPECTED: readonly string[] = ['2026-03-12', 'PETR4', '100', '38.5', 'VALE3', '50', '62.1'];

function keyOf(): string {
    const key: string | undefined = process.env['AI_GATEWAY_API_KEY'] ?? process.env['VERCEL_AI_GATEWAY_API_KEY'];
    if (key === undefined || key === '') {
        throw new Error('no gateway key in EVALS_SECRETS_FILE');
    }
    return key;
}

async function probe(file: string): Promise<void> {
    const mediaType: string = MEDIA_TYPES[extname(file)] ?? 'application/octet-stream';
    const part: { type: 'file'; data: Uint8Array; mediaType: string } = { type: 'file', data: readFileSync(file), mediaType };
    const gateway: ReturnType<typeof createGateway> = createGateway({ apiKey: keyOf() });
    try {
        const result: Awaited<ReturnType<typeof generateText>> = await generateText({
            model: gateway(MODEL_ID),
            messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, part] }],
            maxOutputTokens: 4096,
            providerOptions: { gateway: { only: ['meta'] } }
        });
        const text: string = result.text.replaceAll(',', '.');
        const found: string[] = EXPECTED.filter((needle: string): boolean => text.includes(needle));
        process.stdout.write(
            `${basename(file)}: accepted, finish=${result.finishReason}, outputTokens=${String(result.usage.outputTokens)}, matched ${String(found.length)}/${String(EXPECTED.length)} (${found.join(' ')})\n${result.text}\n`
        );
    } catch (error: unknown) {
        process.stdout.write(`${basename(file)}: rejected, ${error instanceof Error ? error.message.slice(0, 300) : 'unknown error'}\n`);
    }
}

async function main(): Promise<void> {
    loadEnvFile(process.env['EVALS_SECRETS_FILE']);
    for (const file of process.argv.slice(2)) {
        await probe(file);
    }
}

void main();
