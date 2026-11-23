import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../../core/context/app-context.port';
import { AppLocale } from '../../../../shared/i18n/locale';
import { CategoryReaderService, SpendingCategory } from '../../../spending-categories/services/category-reader.service';
import { CategoryKeying, keyCategories, KeyedCategory } from '../../domain/ask-category-keys';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';
import { noInputSchema } from '../../validation/ask-vera-tools.schemas';

@Injectable()
export class ListCategoriesTool extends AskVeraToolPort {
    public readonly name: string = 'list_categories';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof noInputSchema = noInputSchema;

    public constructor(
        private readonly categories: CategoryReaderService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Lista as chaves e os rótulos padrão das categorias de gasto, para achar a chave de um termo como "delivery".'
            : 'Lists the keys and default labels of the spending categories, to find the key for a term like "delivery".';
    }

    public async run(): Promise<AskVeraToolOutput> {
        const categories: readonly SpendingCategory[] = await this.categories.listForCompany();
        const keying: CategoryKeying = keyCategories(categories, this.context.get().locale);
        return {
            payload: { categorias: keying.entries.map((entry: KeyedCategory) => ({ ...entry.assigned })) },
            numbers: [],
            keys: keying.keys
        };
    }
}
