import { MAX_CELL_LENGTH } from './statement-import.types';

export type CsvDelimiter = ',' | ';';

export interface CsvRecord {
    readonly line: number;
    readonly cells: readonly string[];
}

export interface CsvScan {
    readonly records: readonly CsvRecord[];
    readonly unterminatedQuote: boolean;
    readonly overflow: boolean;
}

export function detectDelimiter(firstLine: string): CsvDelimiter {
    const semicolons: number = firstLine.split(';').length - 1;
    const commas: number = firstLine.split(',').length - 1;
    return semicolons > commas ? ';' : ',';
}

class CsvScanner {
    private readonly records: CsvRecord[] = [];
    private cells: string[] = [];
    private field: string = '';
    private inQuotes: boolean = false;
    private atFieldStart: boolean = true;
    private line: number = 1;
    private recordLine: number = 1;
    private index: number = 0;
    private overflow: boolean = false;

    public constructor(
        private readonly text: string,
        private readonly delimiter: CsvDelimiter,
        private readonly maxRecords: number
    ) {}

    public scan(): CsvScan {
        while (this.index < this.text.length && !this.overflow) {
            this.step(this.text.charAt(this.index));
            this.index += 1;
        }
        const unterminatedQuote: boolean = this.inQuotes;
        this.endRecord();
        return { records: this.records, unterminatedQuote, overflow: this.overflow };
    }

    private step(char: string): void {
        if (this.inQuotes) {
            this.stepQuoted(char);
            return;
        }
        this.stepPlain(char);
    }

    private stepQuoted(char: string): void {
        if (char !== '"') {
            this.line += char === '\n' ? 1 : 0;
            this.append(char);
            return;
        }
        if (this.text.charAt(this.index + 1) === '"') {
            this.append('"');
            this.index += 1;
            return;
        }
        this.inQuotes = false;
    }

    private stepPlain(char: string): void {
        if (char === '"' && this.atFieldStart) {
            this.inQuotes = true;
            this.atFieldStart = false;
            return;
        }
        if (char === this.delimiter) {
            this.endField();
            return;
        }
        if (char === '\n' || (char === '\r' && this.text.charAt(this.index + 1) !== '\n')) {
            this.line += 1;
            this.endRecord();
            return;
        }
        if (char !== '\r') {
            this.append(char);
        }
    }

    private append(char: string): void {
        this.atFieldStart = false;
        if (this.field.length < MAX_CELL_LENGTH) {
            this.field += char;
        }
    }

    private endField(): void {
        this.cells.push(this.field);
        this.field = '';
        this.atFieldStart = true;
    }

    private endRecord(): void {
        const blank: boolean = this.cells.length === 0 && this.field === '' && this.atFieldStart;
        if (!blank) {
            this.endField();
            this.records.push({ line: this.recordLine, cells: this.cells });
            this.overflow = this.records.length > this.maxRecords;
        }
        this.cells = [];
        this.recordLine = this.line;
        this.atFieldStart = true;
    }
}

export function readCsv(text: string, delimiter: CsvDelimiter, maxRecords: number): CsvScan {
    return new CsvScanner(text, delimiter, maxRecords).scan();
}
