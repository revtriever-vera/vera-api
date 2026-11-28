import { REDACTED, redactPersonalData } from '../../../shared/utils/personal-data-redaction';

const LABEL_WORDS: string = [
    'titular',
    'cliente',
    'correntista',
    'nome',
    String.raw`c\.?\s?p\.?\s?f\.?(?:\s*\/\s*c\.?\s?n\.?\s?p\.?\s?j\.?)?`,
    'cnpj',
    'documento',
    String.raw`conta(?:\s*corrente)?`,
    String.raw`c\/c`,
    'ag[êe]ncia',
    String.raw`ag\.`,
    'cart[ãa]o',
    'endere[çc]o',
    'telefone',
    'e-?mail'
].join('|');
const LABEL: RegExp = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${LABEL_WORDS})(?![\p{L}\p{N}])\s*[:.\-]?`, 'iu');
const LABEL_ONLY: RegExp = new RegExp(String.raw`^[\s:.\-/]*(?:(?:${LABEL_WORDS})[\s:.\-/]*)+$`, 'iu');
const MONTHS: string = 'jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';
const DATE_TOKEN: RegExp = new RegExp(
    String.raw`(?<!\d)(?:\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:${MONTHS})\p{L}*)(?!\d)`,
    'iu'
);
const AMOUNT_TOKEN: RegExp = /\d[.,]\d{2}(?!\d)/u;

interface LineMask {
    readonly text: string;
    readonly maskNext: boolean;
}

export function isTransactionLine(line: string): boolean {
    return DATE_TOKEN.test(line) && AMOUNT_TOKEN.test(line);
}

function maskHeaderLine(line: string): LineMask {
    const found: RegExpExecArray | null = LABEL.exec(line);
    if (found === null) {
        return { text: line, maskNext: false };
    }
    if (LABEL_ONLY.test(line)) {
        return { text: line, maskNext: true };
    }
    const end: number = found.index + found[0].length;
    const rest: string = line.slice(end).trim();
    return rest === '' ? { text: line, maskNext: true } : { text: `${line.slice(0, end)} ${REDACTED}`, maskNext: false };
}

function maskLine(line: string, pending: boolean): LineMask {
    if (isTransactionLine(line)) {
        return { text: line, maskNext: false };
    }
    if (pending && line.trim() !== '') {
        return { text: REDACTED, maskNext: false };
    }
    const masked: LineMask = maskHeaderLine(line);
    return { text: masked.text, maskNext: pending || masked.maskNext };
}

export function maskBankStatementText(text: string): string {
    let pending: boolean = false;
    const lines: string[] = text.split(/\r?\n/).map((line: string): string => {
        const masked: LineMask = maskLine(line, pending);
        pending = masked.maskNext;
        return masked.text;
    });
    return redactPersonalData(lines.join('\n'));
}
