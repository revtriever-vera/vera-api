import { AppLocale } from '../../../shared/i18n/locale';
import { AiContext, BuiltContext } from './context/ai-context.types';
import { AiTextRenderer, RenderResult } from './context/ai-text-renderer';
import { forbiddenTermIn } from './forbidden-terms';
import { MAX_PARAGRAPHS, MAX_TOTAL_CHARS } from './summary-output.schemas';

const MAX_FREE_COUNT: number = 12;
const ROUNDING_TOLERANCE: number = 1;
const MARKER: RegExp = /\[\[(?:cat|cls):[a-z0-9_]+\]\]/g;
const ISO_MONTH: RegExp = /\d{4}-\d{2}/g;
const NUMBER: RegExp = /\d[\d.,]*\d|\d/g;
const MONEY_BEFORE: RegExp = /(?:R\$|US\$|\$|€)\s*$/;
const POINTS_AFTER: RegExp = /^\s*(?:pp\b|pontos?(?!\p{L})|points?(?!\p{L})|p\.p\.)/iu;
const PERCENT_AFTER: RegExp = /^\s*%/;
const EMPHASIS: string = '**';

export type GuardCheck = 'schema' | 'length' | 'forbidden_term' | 'number' | 'marker' | 'emphasis';

export type GuardResult =
    | { readonly ok: true; readonly paragraphs: readonly string[] }
    | { readonly ok: false; readonly check: GuardCheck; readonly detail: string };

export interface GuardInput {
    readonly paragraphs: readonly string[];
    readonly built: BuiltContext<AiContext>;
    readonly locale: AppLocale;
    readonly renderer: AiTextRenderer;
}

export type FigureKind = 'money' | 'percent' | 'points' | 'bare';

export interface Figure {
    readonly text: string;
    readonly value: number;
    readonly kind: FigureKind;
    readonly decimal: boolean;
}

function failure(check: GuardCheck, detail: string): GuardResult {
    return { ok: false, check, detail };
}

function plainOf(paragraph: string): string {
    return paragraph.replace(MARKER, ' ').replaceAll(EMPHASIS, '').replace(ISO_MONTH, ' ');
}

function valueOf(raw: string, locale: AppLocale): number {
    const normalized: string = locale === 'pt-BR' ? raw.replaceAll('.', '').replace(',', '.') : raw.replaceAll(',', '');
    return Math.abs(Number(normalized));
}

function kindOf(before: string, after: string): FigureKind {
    if (PERCENT_AFTER.test(after)) {
        return 'percent';
    }
    if (POINTS_AFTER.test(after)) {
        return 'points';
    }
    return MONEY_BEFORE.test(before) ? 'money' : 'bare';
}

export function figuresIn(paragraph: string, locale: AppLocale): Figure[] {
    const text: string = plainOf(paragraph);
    return [...text.matchAll(NUMBER)].map((match: RegExpMatchArray): Figure => {
        const raw: string = match[0];
        const end: number = (match.index ?? 0) + raw.length;
        const value: number = valueOf(raw, locale);
        return {
            text: raw,
            value,
            kind: kindOf(text.slice(0, match.index ?? 0), text.slice(end)),
            decimal: !Number.isInteger(value)
        };
    });
}

function nearAny(value: number, allowed: readonly number[]): boolean {
    const rounded: number = Math.round(value);
    return allowed.some((candidate: number): boolean => Math.abs(rounded - candidate) <= ROUNDING_TOLERANCE);
}

function differencesOf(numbers: readonly number[]): readonly number[] {
    return numbers.flatMap((left: number, index: number): number[] =>
        numbers.slice(index + 1).map((right: number): number => Math.abs(left - right))
    );
}

function inContext(figure: Figure, numbers: readonly number[], differences: readonly number[]): boolean {
    if (figure.kind === 'bare' && !figure.decimal && figure.value <= MAX_FREE_COUNT) {
        return true;
    }
    if (nearAny(figure.value, numbers)) {
        return true;
    }
    return figure.kind === 'points' && nearAny(figure.value, differences);
}

function unknownFigure(paragraphs: readonly string[], input: GuardInput): Figure | undefined {
    const differences: readonly number[] = differencesOf(input.built.numbers);
    return paragraphs
        .flatMap((paragraph: string): Figure[] => figuresIn(paragraph, input.locale))
        .find((figure: Figure): boolean => !inContext(figure, input.built.numbers, differences));
}

function emphasisBroken(paragraph: string): boolean {
    const marks: number = paragraph.split(EMPHASIS).length - 1;
    return marks !== 0 && marks !== 2;
}

function renderedOf(paragraphs: readonly string[], input: GuardInput): GuardResult {
    const rendered: string[] = [];
    for (const paragraph of paragraphs) {
        const result: RenderResult = input.renderer.render(paragraph, input.built.keys);
        if (!result.ok) {
            return failure('marker', `the marker ${result.marker ?? 'in the text'} is not valid (${result.reason})`);
        }
        rendered.push(result.text);
    }
    return { ok: true, paragraphs: rendered };
}

export function guardSummary(input: GuardInput): GuardResult {
    const paragraphs: readonly string[] = input.paragraphs;
    if (paragraphs.length < 1 || paragraphs.length > MAX_PARAGRAPHS) {
        return failure('length', `the summary must have 1 to ${String(MAX_PARAGRAPHS)} paragraphs`);
    }
    if (paragraphs.join('').length > MAX_TOTAL_CHARS) {
        return failure('length', `the summary must have at most ${String(MAX_TOTAL_CHARS)} characters in total`);
    }
    const plain: readonly string[] = paragraphs.map(plainOf);
    if (plain.some(forbiddenTermIn)) {
        return failure('forbidden_term', 'the text has a forbidden term: advice, asset names, exclamation, emoji or a mention of AI');
    }
    if (paragraphs.some(emphasisBroken)) {
        return failure('emphasis', 'use ** ** around at most one figure per paragraph, always paired');
    }
    const unknown: Figure | undefined = unknownFigure(paragraphs, input);
    if (unknown !== undefined) {
        return failure('number', `the figure ${unknown.text} is not in the context; cite only figures that appear in the input`);
    }
    return renderedOf(paragraphs, input);
}
