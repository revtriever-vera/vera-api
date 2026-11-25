import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createGateway, generateText } from 'ai';
import { INVESTMENT_EXTRACT_SCHEMA } from '../../src/core/llm/catalog/investment-extract.schema';
import {
    INVESTMENT_EXTRACT_IMAGE_INTRO,
    INVESTMENT_EXTRACT_SYSTEM_PROMPT,
    INVESTMENT_EXTRACT_TEXT_INTRO
} from '../../src/modules/investment-import/domain/prompts/investment-extract.prompt';
import { maskStatementText } from '../../src/modules/investment-import/domain/model/statement-masking';
import { PdfContent, readPdfContent } from '../../src/modules/investment-import/domain/pdf-text';
import { ExtractCase, extractCaseSchema, SectionResult, compareAnswers } from './extract-compare';

const CASES_DIR: string = join(__dirname, '..', 'cases', 'investment_extract', 'avenue');
const FIXTURES_DIR: string = join(__dirname, '..', '..', 'test', 'fixtures', 'investment-import', 'generated');
const DEFAULT_MODEL: string = 'meta/muse-spark-1.3-contributor';

function casesOf(): ExtractCase[] {
    return readdirSync(CASES_DIR)
        .filter((name: string): boolean => name.endsWith('.json'))
        .sort()
        .map((name: string): ExtractCase => extractCaseSchema.parse(JSON.parse(readFileSync(join(CASES_DIR, name), 'utf8'))));
}

function keyOf(): string {
    const key: string | undefined = process.env['AI_GATEWAY_API_KEY'] ?? process.env['VERCEL_AI_GATEWAY_API_KEY'];
    if (key === undefined || key === '') {
        throw new Error('no gateway key in EVALS_SECRETS_FILE');
    }
    return key;
}

async function liveAnswer(item: ExtractCase, bytes: Buffer): Promise<string> {
    const content: PdfContent = await readPdfContent(bytes);
    const text: string = content.pages.map((page: string): string => maskStatementText(page)).join('\n');
    const part: { type: 'text'; text: string } | { type: 'file'; data: Uint8Array; mediaType: string } =
        item.mode === 'text'
            ? { type: 'text', text: `${INVESTMENT_EXTRACT_TEXT_INTRO}\n${text}` }
            : { type: 'file', data: bytes, mediaType: 'application/pdf' };
    const intro: string = item.mode === 'text' ? '' : INVESTMENT_EXTRACT_IMAGE_INTRO;
    const result: Awaited<ReturnType<typeof generateText>> = await generateText({
        model: createGateway({ apiKey: keyOf() })(process.env['EVALS_EXTRACT_MODEL'] ?? DEFAULT_MODEL),
        system: `${INVESTMENT_EXTRACT_SYSTEM_PROMPT}\nJSON schema of the answer: ${JSON.stringify(INVESTMENT_EXTRACT_SCHEMA)}`,
        messages: [{ role: 'user', content: intro === '' ? [part] : [{ type: 'text', text: intro }, part] }],
        maxOutputTokens: 8192,
        temperature: 0
    });
    return result.text.replace(/^```(?:json)?\s*|\s*```$/g, '');
}

async function runCase(item: ExtractCase, live: boolean): Promise<boolean> {
    const expectedText: string = readFileSync(join(FIXTURES_DIR, item.expected), 'utf8');
    const answerText: string = live ? await liveAnswer(item, readFileSync(join(FIXTURES_DIR, item.file))) : expectedText;
    const results: SectionResult[] = compareAnswers(item.sections, JSON.parse(expectedText), JSON.parse(answerText));
    const failed: SectionResult[] = results.filter((result: SectionResult): boolean => !result.passed);
    process.stdout.write(
        `${item.id}: ${failed.length === 0 ? 'ok' : failed.map((result: SectionResult): string => `${result.section} (missing ${String(result.missing)}, extra ${String(result.extra)})`).join(', ')}\n`
    );
    failed.forEach((result: SectionResult): void => {
        result.diffs.forEach((diff: string): void => {
            process.stdout.write(`    ${diff}\n`);
        });
    });
    return failed.length === 0;
}

async function main(): Promise<void> {
    const live: boolean = process.argv.includes('--live');
    if (live) {
        loadEnvFile(process.env['EVALS_SECRETS_FILE']);
    }
    const outcomes: boolean[] = [];
    for (const item of casesOf()) {
        outcomes.push(await runCase(item, live));
    }
    const passed: number = outcomes.filter(Boolean).length;
    process.stdout.write(`investment_extract (${live ? 'live' : 'mock'}): ${String(passed)}/${String(outcomes.length)} cases\n`);
    process.exit(passed === outcomes.length ? 0 : 1);
}

void main();
