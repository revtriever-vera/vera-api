import { ASSET_KINDS } from '../domain/catalog.types';
import { SourceAsset } from '../ports/asset-source.port';
import { CsvRow, csvRows, digitsOf, seriesKeyOf } from './cvm-csv';

export interface FundClassRecord {
    readonly registryId: string;
    readonly cnpj: string;
    readonly name: string;
    readonly classification: string;
    readonly anbima: string;
    readonly ownSeries: boolean;
}

export interface FundSubclassRecord {
    readonly registryId: string;
    readonly subclassId: string;
    readonly name: string;
}

export interface FundSeries {
    readonly key: string;
    readonly cnpj: string;
    readonly name: string;
    readonly fullName: string;
    readonly classification: string;
    readonly anbima: string;
}

export const MIN_NET_WORTH: number = 1_000_000;

const FIF_CLASS_TYPE: string = 'Classes de Cotas de Fundos FIF';
const ACTIVE_SITUATION: string = 'Em Funcionamento Normal';
const NOT_EXCLUSIVE: string = 'N';
const OPEN_AUDIENCES: ReadonlySet<string> = new Set<string>(['Público Geral', 'Qualificado']);
const CLASS_COLUMNS: readonly string[] = [
    'ID_Registro_Classe',
    'CNPJ_Classe',
    'Tipo_Classe',
    'Denominacao_Social',
    'Situacao',
    'Classificacao',
    'Classificacao_Anbima',
    'Exclusivo',
    'Publico_Alvo',
    'Patrimonio_Liquido'
];
const SUBCLASS_COLUMNS: readonly string[] = [
    'ID_Registro_Classe',
    'ID_Subclasse',
    'Denominacao_Social',
    'Situacao',
    'Exclusivo',
    'Publico_Alvo'
];
const NAME_NOISE: readonly RegExp[] = [
    /\bCLASSE DE INVESTIMENTO EM COTAS DE CLASSES DE INVESTIMENTO\b/g,
    /\bCLASSE DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO\b/g,
    /\bCLASSE DE INVESTIMENTO EM COTAS\b/g,
    /\bCLASSE DE INVESTIMENTO\b/g,
    /\bCLASSE DE COTAS\b/g,
    /\bFUNDO DE INVESTIMENTO FINANCEIRO EM COTAS DE FUNDOS DE INVESTIMENTO\b/g,
    /\bFUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO\b/g,
    /\bFUNDO DE INVESTIMENTO EM COTAS DE FIF\b/g,
    /\bFUNDO DE INVESTIMENTO FINANCEIRO\b/g,
    /\bFUNDO DE INVESTIMENTO EM COTAS\b/g,
    /\bFUNDO DE INVESTIMENTO\b/g,
    /\bRESPONSABILIDADE LIMITADA\b/g,
    /\bRESP\.? LIMITADA\b/g,
    /\bRESP\.? LTDA\.?(?=\s|$)/g,
    /\bRL$/g,
    /\bFIF\b/g,
    /\bCIC\b/g,
    /\bFIC\b/g,
    /\bFI\b/g
];

function isOpenToRetail(row: CsvRow): boolean {
    return row('Exclusivo') === NOT_EXCLUSIVE && OPEN_AUDIENCES.has(row('Publico_Alvo'));
}

function leavesAudienceToSubclasses(row: CsvRow): boolean {
    return row('Exclusivo') === '' && row('Publico_Alvo') === '';
}

function netWorthOf(row: CsvRow): number {
    const value: number = Number(row('Patrimonio_Liquido'));
    return Number.isFinite(value) ? value : 0;
}

const SEPARATORS: ReadonlySet<string> = new Set<string>([' ', '-']);

function withoutSeparatorEdges(name: string): string {
    let start: number = 0;
    let end: number = name.length;
    while (start < end && SEPARATORS.has(name.charAt(start))) {
        start += 1;
    }
    while (end > start && SEPARATORS.has(name.charAt(end - 1))) {
        end -= 1;
    }
    return name.slice(start, end);
}

export function searchableName(fullName: string): string {
    const upper: string = fullName.replaceAll(/\s+/g, ' ').trim().toUpperCase();
    const stripped: string = NAME_NOISE.reduce((name: string, pattern: RegExp): string => name.replace(pattern, ' '), upper);
    const cleaned: string = withoutSeparatorEdges(stripped.replaceAll(/\s+/g, ' '));
    return cleaned === '' ? upper : cleaned;
}

function isInvestable(row: CsvRow): boolean {
    return (
        row('Tipo_Classe') === FIF_CLASS_TYPE &&
        row('Situacao') === ACTIVE_SITUATION &&
        (isOpenToRetail(row) || leavesAudienceToSubclasses(row)) &&
        netWorthOf(row) >= MIN_NET_WORTH
    );
}

function classRecordOf(row: CsvRow): FundClassRecord {
    return {
        registryId: row('ID_Registro_Classe'),
        cnpj: digitsOf(row('CNPJ_Classe')),
        name: row('Denominacao_Social'),
        classification: row('Classificacao'),
        anbima: row('Classificacao_Anbima'),
        ownSeries: isOpenToRetail(row)
    };
}

export function parseInvestableClasses(text: string): { readonly read: number; readonly classes: FundClassRecord[] } {
    const classes: FundClassRecord[] = [];
    let read: number = 0;
    for (const row of csvRows(text, CLASS_COLUMNS)) {
        read += 1;
        if (isInvestable(row)) {
            classes.push(classRecordOf(row));
        }
    }
    return { read, classes };
}

function subclassIsOpen(row: CsvRow, parent: FundClassRecord): boolean {
    const audience: string = row('Publico_Alvo');
    if (parent.ownSeries) {
        return row('Exclusivo') !== 'S' && (audience === '' || OPEN_AUDIENCES.has(audience));
    }
    return row('Exclusivo') === NOT_EXCLUSIVE && OPEN_AUDIENCES.has(audience);
}

export function parseActiveSubclasses(text: string, classes: readonly FundClassRecord[]): FundSubclassRecord[] {
    const byId: ReadonlyMap<string, FundClassRecord> = new Map<string, FundClassRecord>(
        classes.map((fundClass: FundClassRecord): [string, FundClassRecord] => [fundClass.registryId, fundClass])
    );
    const subclasses: FundSubclassRecord[] = [];
    for (const row of csvRows(text, SUBCLASS_COLUMNS)) {
        const parent: FundClassRecord | undefined = byId.get(row('ID_Registro_Classe'));
        if (parent !== undefined && row('Situacao') === ACTIVE_SITUATION && subclassIsOpen(row, parent) && row('ID_Subclasse') !== '') {
            subclasses.push({ registryId: row('ID_Registro_Classe'), subclassId: row('ID_Subclasse'), name: row('Denominacao_Social') });
        }
    }
    return subclasses;
}

function subclassName(className: string, subclass: FundSubclassRecord): string {
    const own: string = searchableName(subclass.name);
    return own.includes(searchableName(className)) ? own : `${searchableName(className)} ${own}`;
}

function groupedByClass(subclasses: readonly FundSubclassRecord[]): ReadonlyMap<string, readonly FundSubclassRecord[]> {
    const grouped: Map<string, FundSubclassRecord[]> = new Map<string, FundSubclassRecord[]>();
    for (const subclass of subclasses) {
        grouped.set(subclass.registryId, [...(grouped.get(subclass.registryId) ?? []), subclass]);
    }
    return grouped;
}

function seriesOfClass(fundClass: FundClassRecord, subclasses: readonly FundSubclassRecord[]): FundSeries[] {
    const base: Omit<FundSeries, 'key' | 'name' | 'fullName'> = {
        cnpj: fundClass.cnpj,
        classification: fundClass.classification,
        anbima: fundClass.anbima
    };
    const own: FundSeries[] = fundClass.ownSeries
        ? [{ ...base, key: fundClass.cnpj, name: searchableName(fundClass.name), fullName: fundClass.name }]
        : [];
    return [
        ...own,
        ...subclasses.map((subclass: FundSubclassRecord): FundSeries => ({
            ...base,
            key: seriesKeyOf(fundClass.cnpj, subclass.subclassId),
            name: subclassName(fundClass.name, subclass),
            fullName: subclass.name
        }))
    ];
}

export function fundSeries(classes: readonly FundClassRecord[], subclasses: readonly FundSubclassRecord[]): FundSeries[] {
    const byClass: ReadonlyMap<string, readonly FundSubclassRecord[]> = groupedByClass(subclasses);
    return classes.flatMap((fundClass: FundClassRecord): FundSeries[] => seriesOfClass(fundClass, byClass.get(fundClass.registryId) ?? []));
}

export function fundAsset(series: FundSeries): SourceAsset {
    return {
        externalId: series.key,
        symbol: series.cnpj,
        name: series.name,
        kind: ASSET_KINDS.fund,
        currency: 'BRL',
        raw: { cnpj: series.cnpj, fullName: series.fullName, classification: series.classification, anbima: series.anbima }
    };
}
