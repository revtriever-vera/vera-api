import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { FixedIncomeTitle } from '../domain/fixed-income.types';

export const FIXED_INCOME_EXPORT_AREA: string = 'fixed_income';

export interface FixedIncomeTitleExport {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly indexer: string;
    readonly rateBps: number;
    readonly currency: string;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
    readonly taxRegime: string;
    readonly createdAt: string;
}

export interface FixedIncomeExport {
    readonly titles: FixedIncomeTitleExport[];
}

@Injectable()
export class FixedIncomeAccountExporter extends AccountDataExporterPort {
    public readonly area: string = FIXED_INCOME_EXPORT_AREA;

    public constructor(private readonly titles: FixedIncomeTitleDomain) {
        super();
    }

    public async exportAll(): Promise<FixedIncomeExport> {
        const titles: FixedIncomeTitle[] = await this.titles.listReal();
        return {
            titles: titles.map((title: FixedIncomeTitle): FixedIncomeTitleExport => ({
                id: title.id,
                kind: title.kind,
                name: title.name,
                indexer: title.indexer,
                rateBps: title.rateBps,
                currency: title.currency,
                appliedMinor: title.appliedMinor,
                appliedAt: title.appliedAt,
                maturityDate: title.maturityDate,
                taxRegime: title.taxRegime,
                createdAt: title.createdAt.toISOString()
            }))
        };
    }
}
