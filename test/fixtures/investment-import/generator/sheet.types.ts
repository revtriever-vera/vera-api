export type Cell = string | number | null;

export interface SheetTable {
    readonly name: string;
    readonly slug: string;
    readonly headers: readonly string[];
    readonly rows: readonly (readonly Cell[])[];
}

export interface ReportFile {
    readonly baseName: string;
    readonly sheets: readonly SheetTable[];
}
