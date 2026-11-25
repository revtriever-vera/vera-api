const STOP_WORDS: ReadonlySet<string> = new Set(['FII', 'FDO', 'FUNDO', 'INV', 'IMOB', 'DE', 'DO', 'DA', 'SA', 'S', 'A']);
const MIN_PREFIX: number = 3;
const NON_WORD: RegExp = /[^A-Z0-9 ]/g;

interface SuffixRule {
    readonly numbers: readonly string[];
    readonly kinds: readonly string[] | null;
}

const BDR_NUMBERS: readonly string[] = ['31', '32', '33', '34', '35', '39'];

const SUFFIX_RULES: Readonly<Record<string, SuffixRule>> = {
    ON: { numbers: ['3'], kinds: ['stock'] },
    PN: { numbers: ['4'], kinds: ['stock'] },
    PNA: { numbers: ['5'], kinds: ['stock'] },
    PNB: { numbers: ['6'], kinds: ['stock'] },
    PNC: { numbers: ['7'], kinds: ['stock'] },
    PND: { numbers: ['8'], kinds: ['stock'] },
    UNT: { numbers: ['11'], kinds: ['stock'] },
    CI: { numbers: ['11'], kinds: ['fii', 'etf'] },
    DR1: { numbers: BDR_NUMBERS, kinds: ['bdr'] },
    DR2: { numbers: BDR_NUMBERS, kinds: ['bdr'] },
    DR3: { numbers: BDR_NUMBERS, kinds: ['bdr'] },
    DRN: { numbers: BDR_NUMBERS, kinds: ['bdr'] }
};

export interface ParsedSecuritySpec {
    readonly words: readonly string[];
    readonly numbers: readonly string[];
    readonly kinds: readonly string[] | null;
}

export interface SpecCandidate {
    readonly symbol: string;
    readonly name: string;
    readonly kind: string;
}

export function specKeyOf(spec: string): string {
    return spec
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(NON_WORD, ' ')
        .split(' ')
        .filter((word: string): boolean => word !== '')
        .join(' ');
}

function wordsOf(text: string): string[] {
    return specKeyOf(text)
        .split(' ')
        .filter((word: string): boolean => word !== '' && !STOP_WORDS.has(word));
}

export function parseSecuritySpec(spec: string): ParsedSecuritySpec | null {
    const tokens: string[] = specKeyOf(spec).split(' ');
    const index: number = tokens.findIndex((token: string): boolean => SUFFIX_RULES[token] !== undefined);
    const rule: SuffixRule | undefined = index < 0 ? undefined : SUFFIX_RULES[tokens[index] ?? ''];
    if (rule === undefined) {
        return null;
    }
    const words: string[] = wordsOf(tokens.slice(0, index).join(' '));
    return words.length === 0 ? null : { words, numbers: rule.numbers, kinds: rule.kinds };
}

function numberOf(symbol: string): string {
    return /(\d+)$/.exec(symbol)?.[1] ?? '';
}

function matchOf(specWord: string, nameWords: readonly string[]): number | null {
    if (nameWords.includes(specWord)) {
        return 0;
    }
    return specWord.length >= MIN_PREFIX && nameWords.some((nameWord: string): boolean => nameWord.startsWith(specWord)) ? 1 : null;
}

function scoreOf(parsed: ParsedSecuritySpec, candidate: SpecCandidate): number | null {
    const nameWords: string[] = wordsOf(candidate.name);
    const matches: (number | null)[] = parsed.words.map((word: string): number | null => matchOf(word, nameWords));
    const matchesNumber: boolean = parsed.numbers.includes(numberOf(candidate.symbol));
    const matchesKind: boolean = parsed.kinds === null || parsed.kinds.includes(candidate.kind);
    if (!matchesNumber || !matchesKind || matches.includes(null)) {
        return null;
    }
    return matches.reduce<number>((sum: number, value: number | null): number => sum + (value ?? 0), 0);
}

export function pickBySecuritySpec(parsed: ParsedSecuritySpec, candidates: readonly SpecCandidate[]): string | null {
    const scored: { readonly symbol: string; readonly score: number }[] = candidates.flatMap(
        (candidate: SpecCandidate): { readonly symbol: string; readonly score: number }[] => {
            const score: number | null = scoreOf(parsed, candidate);
            return score === null ? [] : [{ symbol: candidate.symbol.toUpperCase(), score }];
        }
    );
    const best: number = Math.min(...scored.map((item: { readonly score: number }): number => item.score));
    const winners: Set<string> = new Set(
        scored
            .filter((item: { readonly score: number }): boolean => item.score === best)
            .map((item: { readonly symbol: string }): string => item.symbol)
    );
    return winners.size === 1 ? ([...winners][0] ?? null) : null;
}
