import { Injectable } from '@nestjs/common';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { MerchantDictionaryService, MerchantMatch } from '../../spending-categories/services/merchant-dictionary.service';
import { RecurrenceTransaction, TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { addDaysTo } from '../domain/recurring-dates';
import { cleanDescription } from '../domain/merchant-key';
import { titleCase } from '../domain/series-lifecycle';
import { DetectorCategoryKind, DetectorTransaction, WINDOW_DAYS } from '../domain/recurring.types';

const BASE_CURRENCY: string = 'BRL';

interface CategoryInfo {
    readonly key: string | null;
    readonly kind: DetectorCategoryKind;
}

function categoryIndexOf(categories: readonly SpendingCategory[]): Map<string, CategoryInfo> {
    return new Map<string, CategoryInfo>(
        categories.map((category: SpendingCategory): [string, CategoryInfo] => [
            category.id,
            { key: category.systemKey, kind: category.kind as DetectorCategoryKind }
        ])
    );
}

@Injectable()
export class RecurringDetectionInputService {
    public constructor(
        private readonly reader: TransactionReaderService,
        private readonly categories: CategoryReaderService,
        private readonly dictionary: MerchantDictionaryService
    ) {}

    public async load(today: string, excluded: ReadonlySet<string>): Promise<DetectorTransaction[]> {
        const index: Map<string, CategoryInfo> = categoryIndexOf(await this.categories.listForCompany());
        const loaded: DetectorTransaction[] = [];
        for await (const page of this.reader.pagesForRecurrence(addDaysTo(today, -WINDOW_DAYS), today)) {
            loaded.push(...this.detectorPage(page, index, excluded));
        }
        return loaded;
    }

    private detectorPage(
        page: readonly RecurrenceTransaction[],
        index: ReadonlyMap<string, CategoryInfo>,
        excluded: ReadonlySet<string>
    ): DetectorTransaction[] {
        return page
            .filter((row: RecurrenceTransaction): boolean => row.currency === BASE_CURRENCY && !excluded.has(row.id))
            .map((row: RecurrenceTransaction): DetectorTransaction => this.toDetector(row, index));
    }

    public async labelsOf(transactionIds: readonly string[]): Promise<Map<string, string>> {
        const rows: RecurrenceTransaction[] = await this.reader.findForRecurrence(transactionIds);
        return new Map<string, string>(rows.map((row: RecurrenceTransaction): [string, string] => [row.id, this.labelOf(row)]));
    }

    public async toDetectorRow(row: RecurrenceTransaction): Promise<DetectorTransaction> {
        return this.toDetector(row, categoryIndexOf(await this.categories.listForCompany()));
    }

    public labelOf(row: RecurrenceTransaction): string {
        const match: MerchantMatch | null = this.dictionary.resolve(row.normalizedDescription, row.amountMinor);
        if (match !== null) {
            return titleCase(match.pattern);
        }
        if (row.counterpartyName !== null && row.counterpartyName.trim().length > 0) {
            return row.counterpartyName.trim();
        }
        return titleCase(cleanDescription(row.normalizedDescription) ?? row.normalizedDescription);
    }

    private toDetector(row: RecurrenceTransaction, index: ReadonlyMap<string, CategoryInfo>): DetectorTransaction {
        const category: CategoryInfo | undefined = row.categoryId === null ? undefined : index.get(row.categoryId);
        const match: MerchantMatch | null = this.dictionary.resolve(row.normalizedDescription, row.amountMinor);
        return {
            id: row.id,
            accountId: row.accountId,
            date: row.date,
            amountMinor: row.amountMinor,
            normalizedDescription: row.normalizedDescription,
            counterpartyKey: row.counterpartyKey,
            categoryKey: category?.key ?? null,
            categoryKind: category?.kind ?? null,
            dictionaryPattern: match?.pattern ?? null,
            dictionaryCategory: match?.category ?? null,
            installmentTotal: row.installmentTotal,
            isSample: row.isSample
        };
    }
}
