import { Injectable } from '@nestjs/common';
import { FixedIncomeTitlesRepository } from '../repositories/fixed-income-titles.repository';
import { toFixedIncomeTitle } from './fixed-income-title.mapper';
import { FixedIncomeTitle, FixedIncomeTitleRow, TAX_REGIME_BY_KIND, TitleTerms } from './fixed-income.types';

export type TitleDraft = TitleTerms & { readonly name: string };

@Injectable()
export class FixedIncomeTitleDomain {
    public constructor(private readonly titles: FixedIncomeTitlesRepository) {}

    public async create(draft: TitleDraft): Promise<FixedIncomeTitle> {
        return toFixedIncomeTitle(await this.titles.insert({ ...draft, taxRegime: TAX_REGIME_BY_KIND[draft.kind] }));
    }

    public async findById(id: string): Promise<FixedIncomeTitle | null> {
        const row: FixedIncomeTitleRow | null = await this.titles.findById(id);
        return row === null ? null : toFixedIncomeTitle(row);
    }

    public async listAll(): Promise<FixedIncomeTitle[]> {
        return (await this.titles.listAll()).map(toFixedIncomeTitle);
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
}
