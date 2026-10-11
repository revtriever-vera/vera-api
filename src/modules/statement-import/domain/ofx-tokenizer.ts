const TAG_NAME: RegExp = /^\/?[A-Za-z][A-Za-z0-9._-]{0,31}$/;
const MAX_TAG_LENGTH: number = 64;
const MAX_VALUE_LENGTH: number = 1000;
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const ENTITY_PATTERN: RegExp = /&(amp|lt|gt|quot|apos);/g;

export interface OfxToken {
    readonly kind: 'open' | 'close';
    readonly name: string;
    readonly value: string;
    readonly line: number;
}

interface TagSpan {
    readonly start: number;
    readonly end: number;
    readonly inner: string;
    readonly special: boolean;
}

export function decodeEntities(value: string): string {
    return value.replace(ENTITY_PATTERN, (_match: string, name: string): string => ENTITIES[name] ?? '');
}

class OfxScanner {
    private closer: number = -1;
    private closerExhausted: boolean = false;
    private line: number = 1;
    private newline: number;

    public constructor(private readonly text: string) {
        this.newline = text.indexOf('\n');
    }

    public tokens(): OfxToken[] {
        const result: OfxToken[] = [];
        let tag: TagSpan | null = this.nextTag(0);
        while (tag !== null) {
            const following: TagSpan | null = this.nextTag(tag.end);
            this.advanceLine(tag.start);
            if (!tag.special) {
                result.push(this.tokenOf(tag, following?.start ?? this.text.length));
            }
            tag = following;
        }
        return result;
    }

    private tokenOf(tag: TagSpan, textEnd: number): OfxToken {
        const closing: boolean = tag.inner.startsWith('/');
        const raw: string = this.text.slice(tag.end, Math.min(textEnd, tag.end + MAX_VALUE_LENGTH));
        return {
            kind: closing ? 'close' : 'open',
            name: (closing ? tag.inner.slice(1) : tag.inner).toUpperCase(),
            value: closing ? '' : decodeEntities(raw.trim()),
            line: this.line
        };
    }

    private advanceLine(to: number): void {
        while (this.newline !== -1 && this.newline < to) {
            this.line += 1;
            this.newline = this.text.indexOf('\n', this.newline + 1);
        }
    }

    private closerAfter(position: number): number {
        if (this.closerExhausted) {
            return -1;
        }
        if (this.closer < position) {
            this.closer = this.text.indexOf('>', position);
            this.closerExhausted = this.closer === -1;
        }
        return this.closer;
    }

    private nextTag(from: number): TagSpan | null {
        let start: number = this.text.indexOf('<', from);
        while (start !== -1) {
            const end: number = this.closerAfter(start + 1);
            if (end === -1) {
                return null;
            }
            const special: boolean = this.isSpecial(start);
            if (special || this.isTagName(start, end)) {
                return { start, end: end + 1, inner: special ? '' : this.text.slice(start + 1, end), special };
            }
            start = this.text.indexOf('<', start + 1);
        }
        return null;
    }

    private isSpecial(start: number): boolean {
        const marker: string = this.text.charAt(start + 1);
        return marker === '!' || marker === '?';
    }

    private isTagName(start: number, end: number): boolean {
        return end - start - 1 <= MAX_TAG_LENGTH && TAG_NAME.test(this.text.slice(start + 1, end));
    }
}

export function tokenizeOfx(text: string): OfxToken[] {
    return new OfxScanner(text).tokens();
}
