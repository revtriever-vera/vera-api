import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { catalogConfig } from '../config/catalog.config';
import { CATALOG_SOURCES, CatalogSource } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { CatalogLogService } from '../services/catalog-log.service';
import { CvmDailyInformeReaderService } from '../services/cvm-daily-informe-reader.service';
import { DatasetClient, informeMonths, requiredZippedCsvs } from './cvm-datasets';
import {
    FundClassRecord,
    FundSeries,
    FundSubclassRecord,
    fundAsset,
    fundSeries,
    parseActiveSubclasses,
    parseInvestableClasses
} from './cvm-fund-parsers';

const REGISTRY_PATH: string = 'FI/CAD/DADOS/registro_fundo_classe.zip';
const CLASS_ENTRY: string = 'registro_classe.csv';
const SUBCLASS_ENTRY: string = 'registro_subclasse.csv';

@Injectable()
export class CvmFundCatalogDriver extends AssetSourcePort {
    public readonly source: CatalogSource = CATALOG_SOURCES.cvmFunds;

    public constructor(
        @Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>,
        private readonly informe: CvmDailyInformeReaderService,
        private readonly logs: CatalogLogService
    ) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        const client: DatasetClient = { baseUrl: this.config.CVM_DATA_BASE_URL, timeoutMs: this.config.CATALOG_HTTP_TIMEOUT_MS };
        const [classText, subclassText]: string[] = await requiredZippedCsvs(client, REGISTRY_PATH, [CLASS_ENTRY, SUBCLASS_ENTRY]);
        const { read, classes }: { read: number; classes: FundClassRecord[] } = parseInvestableClasses(classText ?? '');
        const subclasses: FundSubclassRecord[] = parseActiveSubclasses(subclassText ?? '', classes);
        const candidates: FundSeries[] = fundSeries(classes, subclasses);
        const withQuota: ReadonlySet<string> = await this.informe.seriesKeys(informeMonths(DateUtil.todayInBrazil()));
        const kept: FundSeries[] = candidates.filter((series: FundSeries): boolean => withQuota.has(series.key));
        this.logs.fundCatalogBuilt({
            classesRead: read,
            classesFiltered: classes.length,
            seriesWithQuota: withQuota.size,
            seriesWritten: kept.length,
            seriesWithoutQuota: candidates.length - kept.length
        });
        return kept.map(fundAsset);
    }
}
