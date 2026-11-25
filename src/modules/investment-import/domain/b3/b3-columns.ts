import { normalizeText, RawCell, RawRow, textOf } from './b3-cells';

export interface ColumnRule {
    readonly aliases: readonly string[];
    readonly required: boolean;
}

export type ColumnSpec<K extends string> = Readonly<Record<K, ColumnRule>>;

export interface HeaderMatch<K extends string> {
    readonly headerIndex: number;
    readonly columns: Readonly<Partial<Record<K, number>>>;
}

const HEADER_SCAN_ROWS: number = 30;

export function column(required: boolean, ...aliases: string[]): ColumnRule {
    return { aliases: aliases.map(normalizeText), required };
}

function columnsOf<K extends string>(spec: ColumnSpec<K>, headers: readonly string[]): Partial<Record<K, number>> {
    const indexByHeader: Map<string, number> = new Map<string, number>();
    headers.forEach((header: string, index: number): void => {
        if (!indexByHeader.has(header)) {
            indexByHeader.set(header, index);
        }
    });
    const found: Partial<Record<K, number>> = {};
    for (const key of Object.keys(spec) as K[]) {
        const index: number | undefined = indexOfAlias(spec[key].aliases, indexByHeader);
        if (index !== undefined) {
            found[key] = index;
        }
    }
    return found;
}

function indexOfAlias(aliases: readonly string[], indexByHeader: ReadonlyMap<string, number>): number | undefined {
    const indexes: number[] = [];
    for (const alias of aliases) {
        const index: number | undefined = indexByHeader.get(alias);
        if (index !== undefined) {
            indexes.push(index);
        }
    }
    return indexes.length === 0 ? undefined : Math.min(...indexes);
}

function hasRequired<K extends string>(spec: ColumnSpec<K>, columns: Partial<Record<K, number>>): boolean {
    return (Object.keys(spec) as K[]).every((key: K): boolean => !spec[key].required || columns[key] !== undefined);
}

export function locateHeader<K extends string>(rows: readonly RawRow[], spec: ColumnSpec<K>): HeaderMatch<K> | null {
    const candidates: readonly RawRow[] = rows.slice(0, HEADER_SCAN_ROWS);
    for (const [headerIndex, row] of candidates.entries()) {
        const columns: Partial<Record<K, number>> = columnsOf(
            spec,
            row.cells.map((cell: RawCell): string => normalizeText(textOf(cell)))
        );
        if (hasRequired(spec, columns)) {
            return { headerIndex, columns };
        }
    }
    return null;
}

export function cellAt<K extends string>(row: RawRow, match: HeaderMatch<K>, key: K): RawCell | undefined {
    const index: number | undefined = match.columns[key];
    return index === undefined ? undefined : row.cells[index];
}

export function textAt<K extends string>(row: RawRow, match: HeaderMatch<K>, key: K): string {
    return textOf(cellAt(row, match, key));
}
