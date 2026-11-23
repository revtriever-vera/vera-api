import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { CategoryRule, RULE_MATCH_TYPES, SpendingCategory } from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { RULES_SPREADSHEET_LABELS, RulesSpreadsheetLabels } from '../domain/rules-spreadsheet-labels';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';

export const RULES_SPREADSHEET_FILE: string = 'regras';

const COLUMN_WIDTHS: readonly number[] = [30, 24, 36, 20, 28];

@Injectable()
export class RulesAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'spending-categories';

    public constructor(
        private readonly categories: SpendingCategoryDomain,
        private readonly rules: CategoryRuleDomain,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const labels: RulesSpreadsheetLabels = RULES_SPREADSHEET_LABELS[this.context.get().locale];
        const rules: CategoryRule[] = (await this.rules.listActive()).filter((rule: CategoryRule): boolean => !rule.isSample);
        const names: Map<string, string> = await this.categoryNames();
        return [
            {
                file: RULES_SPREADSHEET_FILE,
                name: labels.sheet,
                columns: this.columnsOf(labels),
                rows: rules.map((rule: CategoryRule): XlsxCell[] => this.rowOf(rule, labels, names))
            }
        ];
    }

    private async categoryNames(): Promise<Map<string, string>> {
        const categories: SpendingCategory[] = await this.categories.listActive();
        return new Map<string, string>(
            categories.map((item: SpendingCategory): [string, string] => [item.id, item.name ?? item.systemKey ?? ''])
        );
    }

    private columnsOf(labels: RulesSpreadsheetLabels): XlsxColumn[] {
        const headers: string[] = [
            labels.headers.label,
            labels.headers.matchType,
            labels.headers.pattern,
            labels.headers.appliesTo,
            labels.headers.category
        ];
        return headers.map((header: string, index: number): XlsxColumn => ({
            header,
            type: 'text',
            width: COLUMN_WIDTHS[index] as number
        }));
    }

    private rowOf(rule: CategoryRule, labels: RulesSpreadsheetLabels, names: ReadonlyMap<string, string>): XlsxCell[] {
        return [
            spreadsheetSafeText(rule.label),
            labels.matchTypes[rule.matchType] ?? rule.matchType,
            rule.matchType === RULE_MATCH_TYPES.counterparty ? '' : spreadsheetSafeText(rule.pattern),
            labels.directions[rule.appliesTo] ?? rule.appliesTo,
            spreadsheetSafeText(names.get(rule.categoryId) ?? '')
        ];
    }
}
