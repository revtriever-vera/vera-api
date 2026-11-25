import { AppLocale } from '../../../shared/i18n/locale';
import { AiTextRenderer } from './context/ai-text-renderer';
import { LabelSource } from './context/ai-context.types';
import { GuardCheck, GuardResult, guardSummary } from './summary-guard';
import { ChannelProfile } from './ask-channel-profiles';

export type AnswerCheck = GuardCheck | 'sentences' | 'format' | 'unproposed' | 'link';

export type AnswerVerdict =
    { readonly ok: true; readonly text: string } | { readonly ok: false; readonly check: AnswerCheck; readonly detail: string };

export interface AnswerFacts {
    readonly numbers: readonly number[];
    readonly keys: ReadonlyMap<string, LabelSource>;
    readonly assets: ReadonlySet<string>;
    readonly links: ReadonlySet<string>;
}

export interface AnswerGuardInput {
    readonly text: string;
    readonly facts: AnswerFacts;
    readonly locale: AppLocale;
    readonly renderer: AiTextRenderer;
    readonly profile: ChannelProfile;
}

const SENTENCE_END: RegExp = /[.!?]$/;
const WHITESPACE: RegExp = /\s+/;
const LINE_START: RegExp = /^(?:[-*•]|#+|\d+[.)])\s/;
const LINK: RegExp = /\[([^\]\n]{0,120})\]\(([^)\s]{0,200})\)/g;
const LINK_TARGET_SLOTS: RegExp = /\]\(#\)/g;
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

function shapeOf(text: string, profile: ChannelProfile): AnswerVerdict | null {
    if (text.length > profile.maxChars) {
        return failure('length', `the answer must have at most ${String(profile.maxChars)} characters`);
    }
    if (sentencesIn(text) > profile.maxSentences) {
        return failure('sentences', `the answer must have at most ${String(profile.maxSentences)} sentences`);
    }
    return null;
}

function hasMarkdown(text: string): boolean {
    const plain: string = text.replaceAll('**', '');
    const listed: boolean = plain.split('\n').some((line: string): boolean => LINE_START.test(line.trimStart()));
    return listed || CODE.test(plain);
}

function linksOf(text: string): readonly string[] {
    return [...text.matchAll(LINK)].map((match: RegExpMatchArray): string => match[2] ?? '');
}

function linkVerdict(text: string, input: AnswerGuardInput): AnswerVerdict | null {
    const targets: readonly string[] = linksOf(text);
    if (targets.length === 0) {
        return text.includes('](') ? failure('format', 'write the link as [text](route)') : null;
    }
    if (!input.profile.acceptsLink) {
        return failure('format', 'write plain text: no lists, headings, links or code');
    }
    const unknown: string | undefined = targets.find((target: string): boolean => !input.facts.links.has(target));
    return unknown === undefined ? null : failure('link', 'use only links exactly as the help tools returned them');
}

function restoredLinks(rendered: string, targets: readonly string[]): string {
    const queue: string[] = [...targets];
    return rendered.replace(LINK_TARGET_SLOTS, (): string => `](${queue.shift() ?? ''})`);
}

function finalText(rendered: string, profile: ChannelProfile): string {
    return profile.format === 'whatsapp' ? rendered.replace(STRONG, '*$1*') : rendered;
}

function slotted(text: string): string {
    return text.replace(LINK, (_whole: string, label: string): string => `[${label}](#)`);
}

function shapeFailure(text: string, input: AnswerGuardInput): AnswerVerdict | null {
    if (hasMarkdown(text)) {
        return failure('format', 'write plain text: no lists, headings or code');
    }
    return linkVerdict(text, input);
}

function guarded(text: string, input: AnswerGuardInput): GuardResult {
    return guardSummary({
        paragraphs: [slotted(text)],
        built: input.facts,
        locale: input.locale,
        renderer: input.renderer,
        knownAssets: input.facts.assets
    });
}

export function guardAnswer(input: AnswerGuardInput): AnswerVerdict {
    const text: string = input.text.trim();
    const shape: AnswerVerdict | null = text === '' ? failure('length', 'the answer is empty') : shapeFailure(text, input);
    if (shape !== null) {
        return shape;
    }
    const result: GuardResult = guarded(text, input);
    if (!result.ok) {
        return failure(result.check, result.detail);
    }
    const rendered: string = restoredLinks(result.paragraphs.join(' '), linksOf(text));
    return shapeOf(rendered, input.profile) ?? { ok: true, text: finalText(rendered, input.profile) };
}
