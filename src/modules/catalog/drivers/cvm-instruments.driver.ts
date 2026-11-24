import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { catalogConfig } from '../config/catalog.config';
import { B3_ETF_MAP } from '../domain/curated-maps';
import { CATALOG_SOURCES, CatalogSource } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { CuratedEtfEntry } from '../validation/curated-maps.schemas';
import { DatasetClient, latestMonthlyCsv, recentMonths, recentYears, requiredZippedCsv, yearlyCsvs } from './cvm-datasets';
import {
    EtfListing,
    FIAGRO_INFORME_COLUMNS,
    FII_INFORME_COLUMNS,
    FundClass,
    etfAssets,
    parseDepositaryReceipts,
    parseFundClasses,
    parseFundInforme,
    parseListedCompanies
} from './cvm-parsers';

const YEARS_READ: number = 2;
const REGISTRY_PATH: string = 'FI/CAD/DADOS/registro_fundo_classe.zip';
const REGISTRY_ENTRY: string = 'registro_classe.csv';

function etfListings(): EtfListing[] {
    return [...B3_ETF_MAP.values()].map((entry: CuratedEtfEntry): EtfListing => ({ symbol: entry.symbol, cnpj: entry.cnpj }));
}

@Injectable()
export class CvmInstrumentsDriver extends AssetSourcePort {
    public readonly source: CatalogSource = CATALOG_SOURCES.b3;

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        const client: DatasetClient = { baseUrl: this.config.CVM_DATA_BASE_URL, timeoutMs: this.config.CATALOG_HTTP_TIMEOUT_MS };
        const today: string = DateUtil.todayInBrazil();
        const classes: ReadonlyMap<string, FundClass> = parseFundClasses(await requiredZippedCsv(client, REGISTRY_PATH, REGISTRY_ENTRY));
        const byTicker: Map<string, SourceAsset> = new Map<string, SourceAsset>();
        const layers: readonly (readonly SourceAsset[])[] = [
            await this.depositaryReceipts(client, today),
            await this.agroFunds(client, today, classes),
            await this.realEstateFunds(client, today, classes),
            etfAssets(etfListings(), classes),
            await this.companies(client, today)
        ];
        for (const asset of layers.flat()) {
            byTicker.set(asset.externalId, asset);
        }
        return [...byTicker.values()];
    }

    private async companies(client: DatasetClient, today: string): Promise<SourceAsset[]> {
        const texts: string[] = await yearlyCsvs(
            client,
            recentYears(today, YEARS_READ),
            (year: string): string => `CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_${year}.zip`,
            (year: string): string => `fca_cia_aberta_valor_mobiliario_${year}.csv`
        );
        return parseListedCompanies(texts);
    }

    private async realEstateFunds(client: DatasetClient, today: string, classes: ReadonlyMap<string, FundClass>): Promise<SourceAsset[]> {
        const texts: string[] = await yearlyCsvs(
            client,
            recentYears(today, YEARS_READ),
            (year: string): string => `FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_${year}.zip`,
            (year: string): string => `inf_mensal_fii_geral_${year}.csv`
        );
        return parseFundInforme(texts, FII_INFORME_COLUMNS, classes);
    }

    private async agroFunds(client: DatasetClient, today: string, classes: ReadonlyMap<string, FundClass>): Promise<SourceAsset[]> {
        const text: string = await latestMonthlyCsv(
            client,
            recentMonths(today),
            (month: string): string => `FIAGRO/DOC/INF_MENSAL/DADOS/inf_mensal_fiagro_${month}.zip`,
            (month: string): string => `inf_mensal_fiagro_${month}.csv`
        );
        return parseFundInforme([text], FIAGRO_INFORME_COLUMNS, classes);
    }

    private async depositaryReceipts(client: DatasetClient, today: string): Promise<SourceAsset[]> {
        const text: string = await latestMonthlyCsv(
            client,
            recentMonths(today),
            (month: string): string => `FI/DOC/CDA/DADOS/cda_fi_${month}.zip`,
            (month: string): string => `cda_fi_BLC_4_${month}.csv`
        );
        return parseDepositaryReceipts(text);
    }
}
