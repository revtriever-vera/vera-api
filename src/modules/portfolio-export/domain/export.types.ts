import { AppLocale } from '../../../shared/i18n/locale';

export { EXPORT_FORMATS } from '../../../shared/spreadsheet/spreadsheet.types';
export type { ExportFile, ExportFormat } from '../../../shared/spreadsheet/spreadsheet.types';

export interface ExportRow {
    readonly symbol: string;
    readonly name: string;
    readonly className: string;
    readonly titleKindLabel: string;
    readonly issuerName: string;
    readonly groupName: string;
    readonly quantity: string | null;
    readonly quantityDecimals: number | null;
    readonly valueMinor: number;
    readonly valueSourceLabel: string;
}

export interface ExportHoldingInput {
    readonly symbol: string;
    readonly name: string;
    readonly classId: string | null;
    readonly titleKind: string | null;
    readonly issuerId: string | null;
    readonly quantity: string | null;
    readonly quantityDecimals: number | null;
    readonly valueMinor: number;
    readonly valueSource: string;
}

export interface ExportClassInput {
    readonly classId: string;
    readonly displayName: string;
}

export interface ExportIssuerInput {
    readonly name: string;
    readonly groupName: string;
}

export interface ExportSnapshotInput {
    readonly baseCurrency: string;
    readonly issuers: ReadonlyMap<string, ExportIssuerInput>;
    readonly holdings: readonly ExportHoldingInput[];
    readonly classes: readonly ExportClassInput[];
}

export interface ExportTable {
    readonly locale: AppLocale;
    readonly baseCurrency: string;
    readonly rows: readonly ExportRow[];
}
