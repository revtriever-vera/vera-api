import { AppLocale } from '../../../shared/i18n/locale';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { sourceLabelOf, titleKindLabelOf } from './export-labels';
import { ExportClassInput, ExportHoldingInput, ExportIssuerInput, ExportRow, ExportSnapshotInput, ExportTable } from './export.types';

function classNameOf(classId: string | null, names: ReadonlyMap<string, string>): string {
    return classId === null ? '' : (names.get(classId) ?? '');
}

function issuerOf(issuerId: string | null, issuers: ReadonlyMap<string, ExportIssuerInput>): ExportIssuerInput {
    return (issuerId === null ? undefined : issuers.get(issuerId)) ?? { name: '', groupName: '' };
}

export function buildExportRows(snapshot: ExportSnapshotInput, locale: AppLocale): ExportRow[] {
    const names: Map<string, string> = new Map(
        snapshot.classes.map((item: ExportClassInput): [string, string] => [item.classId, item.displayName])
    );
    return snapshot.holdings.map((holding: ExportHoldingInput): ExportRow => ({
        symbol: spreadsheetSafeText(holding.symbol),
        name: spreadsheetSafeText(holding.name),
        className: spreadsheetSafeText(classNameOf(holding.classId, names)),
        titleKindLabel: holding.titleKind === null ? '' : titleKindLabelOf(holding.titleKind, locale),
        issuerName: spreadsheetSafeText(issuerOf(holding.issuerId, snapshot.issuers).name),
        groupName: spreadsheetSafeText(issuerOf(holding.issuerId, snapshot.issuers).groupName),
        quantity: holding.quantity,
        quantityDecimals: holding.quantityDecimals,
        valueMinor: holding.valueMinor,
        valueSourceLabel: sourceLabelOf(holding.valueSource, locale)
    }));
}

export function buildExportTable(snapshot: ExportSnapshotInput, locale: AppLocale): ExportTable {
    return { locale, baseCurrency: snapshot.baseCurrency, rows: buildExportRows(snapshot, locale) };
}
