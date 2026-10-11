import { bankNameOf } from './bank-institutions';
import { OfxToken, tokenizeOfx } from './ofx-tokenizer';
import { RowDraft, statementOf } from './parsed-statement';
import { InvalidFileError, TooManyRowsError } from './statement-import.errors';
import {
    AccountHint,
    DEFAULT_CURRENCY,
    DESCRIPTION_MAX_LENGTH,
    EXTERNAL_ID_MAX_LENGTH,
    IMPORT_FORMATS,
    INVALID_FILE_REASONS,
    MAX_RAW_RECORDS,
    MAX_VALID_ROWS,
    ParsedStatement
} from './statement-import.types';
import { clip, joinDescription, lastDigits, parseAmountMinor, parseOfxDate } from './statement-values';

const TRANSACTION_FIELDS: ReadonlySet<string> = new Set<string>(['DTPOSTED', 'TRNAMT', 'FITID', 'NAME', 'MEMO']);
const HEADER_FIELDS: ReadonlySet<string> = new Set<string>(['CURDEF', 'ACCTID', 'BANKID', 'ORG']);
const CURRENCY_CODE: RegExp = /^[A-Z]{3}$/;
const INSTITUTION_MAX_LENGTH: number = 60;
const LAST_DIGITS: number = 4;

interface OfxDraft {
    readonly line: number;
    readonly fields: Map<string, string>;
}

interface OfxDocument {
    readonly rootSeen: boolean;
    readonly header: ReadonlyMap<string, string>;
    readonly drafts: readonly OfxDraft[];
}

class OfxAssembler {
    private readonly header: Map<string, string> = new Map<string, string>();
    private readonly drafts: OfxDraft[] = [];
    private current: OfxDraft | null = null;
    private rootSeen: boolean = false;

    public feed(token: OfxToken): void {
        if (token.kind === 'close') {
            this.onClose(token);
            return;
        }
        this.rootSeen = this.rootSeen || token.name === 'OFX';
        if (token.name === 'STMTTRN') {
            this.closeTransaction();
            this.current = { line: token.line, fields: new Map<string, string>() };
            return;
        }
        this.assign(token);
    }

    public document(): OfxDocument {
        this.closeTransaction();
        return { rootSeen: this.rootSeen, header: this.header, drafts: this.drafts };
    }

    private onClose(token: OfxToken): void {
        if (token.name === 'STMTTRN') {
            this.closeTransaction();
        }
    }

    private closeTransaction(): void {
        if (this.current === null) {
            return;
        }
        this.drafts.push(this.current);
        this.current = null;
        if (this.drafts.length > MAX_RAW_RECORDS) {
            throw new TooManyRowsError(MAX_VALID_ROWS);
        }
    }

    private assign(token: OfxToken): void {
        const target: Map<string, string> = this.current?.fields ?? this.header;
        const allowed: ReadonlySet<string> = this.current === null ? HEADER_FIELDS : TRANSACTION_FIELDS;
        if (token.value !== '' && allowed.has(token.name) && !target.has(token.name)) {
            target.set(token.name, token.value);
        }
    }
}

function currencyOf(header: ReadonlyMap<string, string>): string | null {
    const code: string = (header.get('CURDEF') ?? '').toUpperCase();
    return CURRENCY_CODE.test(code) ? code : null;
}

function hintOf(header: ReadonlyMap<string, string>): AccountHint | null {
    const organization: string | undefined = header.get('ORG');
    const institution: string | null =
        bankNameOf(header.get('BANKID')) ?? (organization === undefined ? null : clip(organization, INSTITUTION_MAX_LENGTH));
    const numberLast4: string | null = lastDigits(header.get('ACCTID'), LAST_DIGITS);
    return institution === null && numberLast4 === null ? null : { institution, numberLast4 };
}

function identifierOf(fitid: string | undefined): string | null {
    return fitid === undefined || fitid.length > EXTERNAL_ID_MAX_LENGTH ? null : `ofx:${fitid}`;
}

function draftOf(entry: OfxDraft, currency: string): RowDraft {
    const dated: string | undefined = entry.fields.get('DTPOSTED');
    const amount: string | undefined = entry.fields.get('TRNAMT');
    return {
        line: entry.line,
        date: dated === undefined ? null : parseOfxDate(dated),
        amountMinor: amount === undefined ? null : parseAmountMinor(amount, 'auto', currency),
        description: joinDescription(entry.fields.get('NAME') ?? '', entry.fields.get('MEMO') ?? '', DESCRIPTION_MAX_LENGTH),
        externalId: identifierOf(entry.fields.get('FITID'))
    };
}

export function parseOfx(text: string, currency: string | null): ParsedStatement {
    const assembler: OfxAssembler = new OfxAssembler();
    for (const token of tokenizeOfx(text)) {
        assembler.feed(token);
    }
    const document: OfxDocument = assembler.document();
    if (!document.rootSeen) {
        throw new InvalidFileError(INVALID_FILE_REASONS.malformed);
    }
    const declared: string | null = currencyOf(document.header);
    const effective: string = currency ?? declared ?? DEFAULT_CURRENCY;
    return statementOf(
        IMPORT_FORMATS.ofx,
        document.drafts.map((entry: OfxDraft): RowDraft => draftOf(entry, effective)),
        { currency: declared, accountHint: hintOf(document.header) }
    );
}
