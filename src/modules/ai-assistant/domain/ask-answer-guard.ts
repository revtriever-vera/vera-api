import { AppLocale } from '../../../shared/i18n/locale';
import { AiTextRenderer } from './context/ai-text-renderer';
import { LabelSource } from './context/ai-context.types';
import { GuardCheck, GuardResult, guardSummary } from './summary-guard';
import { ASK_VERA_MAX_ANSWER_CHARS, ASK_VERA_MAX_SENTENCES } from './ask-vera.types';

export type AnswerCheck = GuardCheck | 'sentences' | 'format' | 'unproposed';

export type AnswerVerdict =
    { readonly ok: true; readonly text: string } | { readonly ok: false; readonly check: AnswerCheck; readonly detail: string };

export interface AnswerFacts {
    readonly numbers: readonly number[];
    readonly keys: ReadonlyMap<string, LabelSource>;
}

export interface AnswerGuardInput {
    readonly text: string;
    readonly facts: AnswerFacts;
    readonly locale: AppLocale;
    readonly renderer: AiTextRenderer;
}

const SENTENCE_END: RegExp = /[.!?]$/;
const WHITESPACE: RegExp = /\s+/;
const LINE_START: RegExp = /^(?:[-*•]|#+|\d+[.)])\s/;
const LINK: string = '](';
const CODE: RegExp = /`|__/;
const STRONG: RegExp = /\*\*([^*]+)\*\*/g;

export function sentencesIn(text: string): number {
    const words: string[] = text.trim().split(WHITESPACE);
    const ended: number = words.filter((word: string): boolean => SENTENCE_END.test(word)).length;
    const open: boolean = text.trim() !== '' && !SENTENCE_END.test(words.at(-1) ?? '');
    return ended + (open ? 1 : 0);
}

function failure(check: AnswerCheck, detail: string): AnswerVerdict {
    return { ok: false, check, detail };
}

function shapeOf(text: string): AnswerVerdict | null {
    if (text.length > ASK_VERA_MAX_ANSWER_CHARS) {
        return failure('length', `the answer must have at most ${String(ASK_VERA_MAX_ANSWER_CHARS)} characters`);
    }
    if (sentencesIn(text) > ASK_VERA_MAX_SENTENCES) {
        return failure('sentences', `the answer must have at most ${String(ASK_VERA_MAX_SENTENCES)} sentences`);
    }
    return null;
}

function hasMarkdown(text: string): boolean {
    const plain: string = text.replaceAll('**', '');
    const listed: boolean = plain.split('\n').some((line: string): boolean => LINE_START.test(line.trimStart()));
    return listed || plain.includes(LINK) || CODE.test(plain);
}

export function guardAnswer(input: AnswerGuardInput): AnswerVerdict {
    const text: string = input.text.trim();
    if (text === '') {
        return failure('length', 'the answer is empty');
    }
    if (hasMarkdown(text)) {
        return failure('format', 'write plain text: no lists, headings, links or code');
    }
    const guarded: GuardResult = guardSummary({ paragraphs: [text], built: input.facts, locale: input.locale, renderer: input.renderer });
    if (!guarded.ok) {
        return failure(guarded.check, guarded.detail);
    }
    const rendered: string = guarded.paragraphs.join(' ');
    return shapeOf(rendered) ?? { ok: true, text: rendered.replace(STRONG, '*$1*') };
}
