import { AppLocale } from '../../../shared/i18n/locale';
import { SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { exportRowOf } from './export-columns';
import { categoryLabelOf } from './export-labels';
import { ExportTransaction, TransactionExportRow } from './transactions-export.types';

export function categoryLabelsOf(categories: readonly SpendingCategory[], locale: AppLocale): Map<string, string> {
    return new Map<string, string>(
        categories.map((category: SpendingCategory): [string, string] => [category.id, categoryLabelOf(category, locale)])
    );
}

function labelOf(transaction: ExportTransaction, labels: ReadonlyMap<string, string>, uncategorized: string): string {
    return transaction.categoryId === null ? uncategorized : (labels.get(transaction.categoryId) ?? uncategorized);
}

export async function* exportRowsOf(
    pages: AsyncIterable<readonly ExportTransaction[]>,
    labels: ReadonlyMap<string, string>,
    locale: AppLocale
): AsyncGenerator<TransactionExportRow> {
    const uncategorized: string = categoryLabelOf(undefined, locale);
    for await (const page of pages) {
        yield* page.map((transaction: ExportTransaction): TransactionExportRow =>
            exportRowOf(transaction, labelOf(transaction, labels, uncategorized), locale)
        );
    }
}
