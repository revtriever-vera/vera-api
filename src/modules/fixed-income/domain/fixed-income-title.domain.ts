import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { FixedIncomeTitlesRepository } from '../repositories/fixed-income-titles.repository';
import { toFixedIncomeTitle } from './fixed-income-title.mapper';
import { FixedIncomeTitle, FixedIncomeTitleRow, TAX_REGIME_BY_KIND, TitleTerms } from './fixed-income.types';

export type TitleDraft = TitleTerms & { readonly name: string; readonly issuerId: string | null; readonly holderUserId: string | null };

@Injectable()
export class FixedIncomeTitleDomain {
    public constructor(private readonly titles: FixedIncomeTitlesRepository) {}

    public async create(draft: TitleDraft): Promise<FixedIncomeTitle> {
        return toFixedIncomeTitle(await this.titles.insert({ ...draft, taxRegime: TAX_REGIME_BY_KIND[draft.kind] }));
    }

    public async createImported(draft: TitleDraft, importId: string): Promise<FixedIncomeTitle> {
        return toFixedIncomeTitle(await this.titles.insert({ ...draft, importId, taxRegime: TAX_REGIME_BY_KIND[draft.kind] }));
    }

    public async listByImport(importId: string): Promise<FixedIncomeTitle[]> {
        return (await this.titles.listByImport(importId)).map(toFixedIncomeTitle);
    }

    public async countByImports(importIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
        const counts: Map<string, number> = new Map();
        for (const row of await this.titles.listByImports(importIds)) {
            if (row.importId !== null) {
                counts.set(row.importId, (counts.get(row.importId) ?? 0) + 1);
            }
        }
        return counts;
    }

    public async createSample(draft: TitleDraft): Promise<FixedIncomeTitle> {
        return toFixedIncomeTitle(await this.titles.insertSample({ ...draft, taxRegime: TAX_REGIME_BY_KIND[draft.kind] }));
    }

    public async listReal(): Promise<FixedIncomeTitle[]> {
        return (await this.titles.listReal()).map(toFixedIncomeTitle);
    }

    public async listSamples(): Promise<FixedIncomeTitle[]> {
        return (await this.titles.listSamples()).map(toFixedIncomeTitle);
    }

    public async removeSamples(): Promise<number> {
        return this.titles.hardDeleteSamples();
    }

    public async findById(id: string): Promise<FixedIncomeTitle | null> {
        const row: FixedIncomeTitleRow | null = await this.titles.findById(id);
        return row === null ? null : toFixedIncomeTitle(row);
    }

    public async listAll(): Promise<FixedIncomeTitle[]> {
        return (await this.titles.listAll()).map(toFixedIncomeTitle);
    }

    public async listByHolder(filter: HolderFilter): Promise<FixedIncomeTitle[]> {
        return (await this.titles.listByHolder(filter)).map(toFixedIncomeTitle);
    }

    public async clearHolder(userId: string): Promise<number> {
        return (await this.titles.clearHolder(userId)).length;
    }

    public async count(): Promise<number> {
        return this.titles.countActive();
    }

    public async update(id: string, draft: TitleDraft): Promise<FixedIncomeTitle | null> {
        const row: FixedIncomeTitleRow | null = await this.titles.patch(id, { ...draft, taxRegime: TAX_REGIME_BY_KIND[draft.kind] });
        return row === null ? null : toFixedIncomeTitle(row);
    }

    public async remove(id: string): Promise<boolean> {
        return (await this.titles.softDelete(id)) !== null;
    }

    public async listCompanyIdsWithRealAcrossTenants(): Promise<string[]> {
        return this.titles.listCompanyIdsWithRealAcrossTenants();
    }
}
