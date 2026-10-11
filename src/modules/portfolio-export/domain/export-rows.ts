import { AppLocale } from '../../../shared/i18n/locale';
import { sourceLabelOf } from './export-labels';
import { spreadsheetSafeText } from './spreadsheet-safe-text';
import { ExportClassInput, ExportHoldingInput, ExportRow, ExportSnapshotInput, ExportTable } from './export.types';

function classNameOf(classId: string | null, names: ReadonlyMap<string, string>): string {
    return classId === null ? '' : (names.get(classId) ?? '');
}

export function buildExportRows(snapshot: ExportSnapshotInput, locale: AppLocale): ExportRow[] {
    const names: Map<string, string> = new Map(
        snapshot.classes.map((item: ExportClassInput): [string, string] => [item.classId, item.displayName])
    );
    return snapshot.holdings.map((holding: ExportHoldingInput): ExportRow => ({
        symbol: spreadsheetSafeText(holding.symbol),
        name: spreadsheetSafeText(holding.name),
        className: spreadsheetSafeText(classNameOf(holding.classId, names)),
        quantity: holding.quantity,
        quantityDecimals: holding.quantityDecimals,
        valueMinor: holding.valueMinor,
        valueSourceLabel: sourceLabelOf(holding.valueSource, locale)
    }));
}

export function buildExportTable(snapshot: ExportSnapshotInput, locale: AppLocale): ExportTable {
    return { locale, baseCurrency: snapshot.baseCurrency, rows: buildExportRows(snapshot, locale) };
}
