import { Injectable } from '@nestjs/common';
import { AiMarkerKind, LabelSource } from './ai-context.types';
import { markerKeyOf } from './context-keys';

export type RenderFailure = 'unknown_marker' | 'malformed_marker' | 'no_marker';

export type RenderResult =
    | { readonly ok: true; readonly text: string; readonly markers: number }
    | { readonly ok: false; readonly reason: RenderFailure; readonly marker: string | null };

export interface RenderOptions {
    readonly requireMarker?: boolean;
}

const MARKER: RegExp = /\[\[(cat|cls):([a-z0-9_]+)\]\]/g;
const SENTENCE_TERMINATORS: string = '.!?';
const LEFTOVER: RegExp = /\[\[|\]\]/;

function atSentenceStart(before: string): boolean {
    const line: string = before.slice(before.lastIndexOf('\n') + 1);
    const trimmed: string = line.trimEnd();
    if (trimmed === '') {
        return true;
    }
    return trimmed !== line && SENTENCE_TERMINATORS.includes(trimmed.slice(-1));
}

function renderName(name: string, before: string): string {
    return atSentenceStart(before) ? name : name.toLowerCase();
}

@Injectable()
export class AiTextRenderer {
    public render(text: string, keys: ReadonlyMap<string, LabelSource>, options: RenderOptions = {}): RenderResult {
        const matches: RegExpExecArray[] = [...text.matchAll(MARKER)];
        const unknown: RegExpExecArray | undefined = matches.find(
            (match: RegExpExecArray): boolean => !keys.has(markerKeyOf(match[1] as AiMarkerKind, match[2] ?? ''))
        );
        if (unknown !== undefined) {
            return { ok: false, reason: 'unknown_marker', marker: unknown[0] };
        }
        const rendered: string = this.replace(text, keys);
        if (LEFTOVER.test(rendered)) {
            return { ok: false, reason: 'malformed_marker', marker: null };
        }
        if (options.requireMarker === true && matches.length === 0) {
            return { ok: false, reason: 'no_marker', marker: null };
        }
        return { ok: true, text: rendered, markers: matches.length };
    }

    private replace(text: string, keys: ReadonlyMap<string, LabelSource>): string {
        return text.replace(MARKER, (_whole: string, kind: string, chave: string, offset: number): string => {
            const source: LabelSource | undefined = keys.get(markerKeyOf(kind as AiMarkerKind, chave));
            return renderName(source?.name ?? '', text.slice(0, offset));
        });
    }
}
