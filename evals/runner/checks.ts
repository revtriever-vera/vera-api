import { LlmStopReason } from '../../src/core/llm/llm.types';
import { parseJsonObject } from '../../src/core/llm/structured-output';
import { AiTextRenderer } from '../../src/modules/ai-assistant/domain/context/ai-text-renderer';
import { GuardResult, guardSummary } from '../../src/modules/ai-assistant/domain/summary-guard';
import { summaryOutputSchema } from '../../src/modules/ai-assistant/domain/summary-output.schemas';
import { AskCase, EvalCase, SummaryCase } from './case.schemas';
import { builtOf } from './cases';
import type { CallTrace } from './generate';

export interface CheckFailure {
    readonly check: string;
    readonly detail: string;
}

export interface CheckInput {
    readonly item: EvalCase;
    readonly text: string;
    readonly stopReason: LlmStopReason;
    readonly fixed: boolean;
    readonly toolsUsed?: readonly string[];
    readonly ending?: 'answered' | 'direct' | 'truncated' | 'check_failed';
    readonly calls?: readonly CallTrace[];
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
    const ended: number = (text.match(SENTENCE_END) ?? []).length;
    const trimmed: string = text.trim();
    return trimmed !== '' && !/[.?]$/.test(trimmed) ? ended + 1 : ended;
}

function stopwordHits(text: string, locale: EvalCase['locale']): number {
    const words: string[] = (text.toLowerCase().match(WORD) ?? []).filter((word: string): boolean => STOPWORDS[locale].has(word));
    return words.length;
}

export function languageOf(text: string, fallback: EvalCase['locale'] = 'pt-BR'): EvalCase['locale'] {
    const portuguese: number = stopwordHits(text, 'pt-BR');
    const english: number = stopwordHits(text, 'en');
    if (portuguese === english) {
        return fallback;
    }
    return portuguese > english ? 'pt-BR' : 'en';
}

function sentenceFailure(item: EvalCase, text: string): CheckFailure[] {
    const count: number = sentencesIn(text);
    const { min, max }: EvalCase['expect']['sentences'] = item.expect.sentences;
    return count < min || count > max ? [fail('sentences', `${String(count)} sentences, expected ${String(min)} to ${String(max)}`)] : [];
}

function languageFailure(item: EvalCase, text: string): CheckFailure[] {
    const detected: EvalCase['locale'] = languageOf(text, item.locale);
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

function guarded(item: SummaryCase, paragraphs: readonly string[]): GuardResult {
    return guardSummary({ paragraphs, built: builtOf(item), locale: item.locale, renderer: new AiTextRenderer() });
}

function modelOutcome(input: CheckInput, item: SummaryCase): CheckOutcome {
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
    const result: GuardResult = guarded(item, parsed.paragraphs);
    if (!result.ok) {
        return { failures: [fail(result.check, result.detail)], rendered: [] };
    }
    return { failures: softChecks(item, result.paragraphs), rendered: result.paragraphs };
}

function toolFailures(item: AskCase, used: readonly string[]): CheckFailure[] {
    const used_: ReadonlySet<string> = new Set(used);
    const allowed: ReadonlySet<string> = new Set(item.tools.allowed);
    const missing: CheckFailure[] = item.tools.required
        .filter((name: string): boolean => !used_.has(name))
        .map((name: string): CheckFailure => fail('tool_missing', `did not call ${name}`));
    const extra: CheckFailure[] = used
        .filter((name: string): boolean => !allowed.has(name))
        .map((name: string): CheckFailure => fail('tool_unexpected', `called ${name}`));
    return [...missing, ...extra];
}

export function isEmptyCall(call: CallTrace): boolean {
    return call.textChars === 0 && call.toolCalls === 0;
}

function endingFailure(input: CheckInput): CheckFailure {
    const last: CallTrace | undefined = input.calls?.at(-1);
    if (last?.stopReason === 'max_tokens') {
        return fail('truncated', `the last call hit maxOutputTokens (finish ${last.finishReason})`);
    }
    if (last !== undefined && isEmptyCall(last)) {
        return fail('empty', `the last call returned no text (finish ${last.finishReason})`);
    }
    return fail(
        input.ending === 'truncated' ? 'max_steps' : (input.ending ?? 'check_failed'),
        'the loop did not end with an accepted answer'
    );
}

function askOutcome(input: CheckInput, item: AskCase): CheckOutcome {
    if (input.fixed) {
        return { failures: softChecks(item, [input.text]), rendered: [input.text] };
    }
    if (input.ending !== 'answered') {
        return { failures: [endingFailure(input)], rendered: [] };
    }
    const failures: CheckFailure[] = [...softChecks(item, [input.text]), ...toolFailures(item, input.toolsUsed ?? [])];
    return { failures, rendered: [input.text] };
}

export function checkOutput(input: CheckInput): CheckOutcome {
    const item: EvalCase = input.item;
    if (item.task === 'ask_vera_step') {
        return askOutcome(input, item);
    }
    if (!input.fixed) {
        return modelOutcome(input, item);
    }
    const rendered: readonly string[] = input.item.reference;
    return { failures: softChecks(input.item, rendered), rendered };
}
