import { LlmStopReason } from '../../src/core/llm/llm.types';
import { parseJsonObject } from '../../src/core/llm/structured-output';
import { AiTextRenderer } from '../../src/modules/ai-assistant/domain/context/ai-text-renderer';
import { GuardResult, guardSummary } from '../../src/modules/ai-assistant/domain/summary-guard';
import { summaryOutputSchema } from '../../src/modules/ai-assistant/domain/summary-output.schemas';
import { EvalCase } from './case.schemas';
import { builtOf } from './cases';

export interface CheckFailure {
    readonly check: string;
    readonly detail: string;
}

export interface CheckInput {
    readonly item: EvalCase;
    readonly text: string;
    readonly stopReason: LlmStopReason;
    readonly fixed: boolean;
}

export interface CheckOutcome {
    readonly failures: readonly CheckFailure[];
    readonly rendered: readonly string[];
}

const STOPWORDS: Readonly<Record<EvalCase['locale'], ReadonlySet<string>>> = {
    'pt-BR': new Set(['de', 'da', 'do', 'que', 'para', 'com', 'em', 'uma', 'os', 'as', 'foi', 'por', 'mais', 'sua', 'seu', 'não', 'você']),
    en: new Set(['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'your', 'you', 'was', 'are', 'it', 'on', 'than'])
};
const TONE_PATTERNS: readonly RegExp[] = [
    /(?<![\p{L}\p{N}_])assistente(?![\p{L}\p{N}_])/iu,
    /(?<![\p{L}\p{N}_])assistant(?![\p{L}\p{N}_])/iu,
    /intelig[eê]ncia artificial/iu,
    /artificial intelligence/iu
];
const SENTENCE_END: RegExp = /[.?](?=\s|$)/g;
const WORD: RegExp = /[\p{L}]+/gu;
const EMPHASIS: RegExp = /\*\*/g;

function fail(check: string, detail: string): CheckFailure {
    return { check, detail };
}

function plainOf(paragraphs: readonly string[]): string {
    return paragraphs.join(' ').replaceAll(EMPHASIS, '');
}

export function sentencesIn(text: string): number {
    return (text.match(SENTENCE_END) ?? []).length;
}

function stopwordHits(text: string, locale: EvalCase['locale']): number {
    const words: string[] = (text.toLowerCase().match(WORD) ?? []).filter((word: string): boolean => STOPWORDS[locale].has(word));
    return words.length;
}

export function languageOf(text: string): EvalCase['locale'] {
    return stopwordHits(text, 'pt-BR') >= stopwordHits(text, 'en') ? 'pt-BR' : 'en';
}

function sentenceFailure(item: EvalCase, text: string): CheckFailure[] {
    const count: number = sentencesIn(text);
    const { min, max }: EvalCase['expect']['sentences'] = item.expect.sentences;
    return count < min || count > max ? [fail('sentences', `${String(count)} sentences, expected ${String(min)} to ${String(max)}`)] : [];
}

function languageFailure(item: EvalCase, text: string): CheckFailure[] {
    const detected: EvalCase['locale'] = languageOf(text);
    return detected === item.locale ? [] : [fail('language', `text looks ${detected}, expected ${item.locale}`)];
}

function toneFailure(text: string): CheckFailure[] {
    return TONE_PATTERNS.some((pattern: RegExp): boolean => pattern.test(text))
        ? [fail('tone', 'mentions the assistant or artificial intelligence')]
        : [];
}

function mentionFailures(item: EvalCase, text: string): CheckFailure[] {
    const lowered: string = text.toLowerCase();
    const missing: CheckFailure[] = [...item.expect.mustCite, ...item.expect.mustMention]
        .filter((needle: string): boolean => !lowered.includes(needle.toLowerCase()))
        .map((needle: string): CheckFailure => fail('expected_text', `missing "${needle}"`));
    const present: CheckFailure[] = item.expect.mustNotMention
        .filter((needle: string): boolean => lowered.includes(needle.toLowerCase()))
        .map((needle: string): CheckFailure => fail('forbidden_text', `should not mention "${needle}"`));
    return [...missing, ...present];
}

function softChecks(item: EvalCase, rendered: readonly string[]): CheckFailure[] {
    const text: string = plainOf(rendered);
    return [...sentenceFailure(item, text), ...languageFailure(item, text), ...toneFailure(text), ...mentionFailures(item, text)];
}

type Parsed = { readonly ok: true; readonly paragraphs: readonly string[] } | { readonly ok: false; readonly failure: CheckFailure };

function paragraphsOf(text: string): Parsed {
    const parsed: ReturnType<typeof summaryOutputSchema.safeParse> = summaryOutputSchema.safeParse(parseJsonObject(text));
    if (parsed.success) {
        return { ok: true, paragraphs: parsed.data.paragraphs };
    }
    return { ok: false, failure: fail('schema', parsed.error.issues[0]?.message ?? 'not a JSON object with paragraphs') };
}

function guarded(item: EvalCase, paragraphs: readonly string[]): GuardResult {
    return guardSummary({ paragraphs, built: builtOf(item), locale: item.locale, renderer: new AiTextRenderer() });
}

function modelOutcome(input: CheckInput): CheckOutcome {
    if (input.stopReason === 'max_tokens') {
        return { failures: [fail('truncated', 'the answer hit maxOutputTokens')], rendered: [] };
    }
    if (input.text === '') {
        return { failures: [fail('empty', 'the model returned no text')], rendered: [] };
    }
    const parsed: Parsed = paragraphsOf(input.text);
    if (!parsed.ok) {
        return { failures: [parsed.failure], rendered: [] };
    }
    const result: GuardResult = guarded(input.item, parsed.paragraphs);
    if (!result.ok) {
        return { failures: [fail(result.check, result.detail)], rendered: [] };
    }
    return { failures: softChecks(input.item, result.paragraphs), rendered: result.paragraphs };
}

export function checkOutput(input: CheckInput): CheckOutcome {
    if (!input.fixed) {
        return modelOutcome(input);
    }
    const rendered: readonly string[] = input.item.reference;
    return { failures: softChecks(input.item, rendered), rendered };
}
