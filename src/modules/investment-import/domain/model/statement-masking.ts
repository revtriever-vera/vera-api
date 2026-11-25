import { REDACTED, redactPersonalData } from '../../../../shared/utils/personal-data-redaction';

const LABEL_WORDS: string = [
    String.raw`c[óo]d(?:igo|\.)?\s*(?:do\s*)?cliente`,
    'cliente',
    'titular',
    'investidor',
    'nome',
    String.raw`c\.?\s?p\.?\s?f\.?(?:\s*\/\s*c\.?\s?n\.?\s?p\.?\s?j\.?)?`,
    'cnpj',
    String.raw`conta(?:\s*corrente)?`,
    String.raw`c\/c`,
    'ag[êe]ncia',
    'v[íi]nculo',
    'endere[çc]o',
    'telefone',
    'e-?mail'
].join('|');
const LABEL: RegExp = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${LABEL_WORDS})(?![\p{L}\p{N}])\s*[:.\-]?`, 'giu');
const LABEL_ONLY: RegExp = new RegExp(String.raw`^[\s:.\-/]*(?:(?:${LABEL_WORDS})[\s:.\-/]*)+$`, 'iu');

function maskLine(line: string): { readonly text: string; readonly needsNext: boolean } {
    const first: RegExpExecArray | null = new RegExp(LABEL.source, 'iu').exec(line);
    if (first === null) {
        return { text: line, needsNext: false };
    }
    const kept: string = line.slice(0, first.index + first[0].length);
    const rest: string = line.slice(first.index + first[0].length).trim();
    if (LABEL_ONLY.test(line)) {
        return { text: line, needsNext: true };
    }
    return { text: rest === '' ? line : `${kept} ${REDACTED}`, needsNext: rest === '' };
}

export function maskStatementText(text: string): string {
    let maskNext: boolean = false;
    const masked: string[] = text.split(/\r?\n/).map((line: string): string => {
        if (maskNext && line.trim() !== '') {
            maskNext = false;
            return REDACTED;
        }
        const result: { readonly text: string; readonly needsNext: boolean } = maskLine(line);
        maskNext = maskNext || result.needsNext;
        return result.text;
    });
    return redactPersonalData(masked.join('\n'));
}
