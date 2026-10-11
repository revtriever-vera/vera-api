import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { CategoryAction, RuleAction, RuleMatchType } from '../domain/categories.types';

const CATEGORIES_WRITE: string = 'spending-categories-write';
const RULES_WRITE: string = 'spending-rules-write';

@Injectable()
export class SpendingCategoriesLogService {
    public constructor(private readonly logService: LogService) {}

    public categoryWritten(categoryId: string, action: CategoryAction, recategorized: number): void {
        this.logService.info({
            message: 'spending category written',
            identifier: CATEGORIES_WRITE,
            meta: { categoryId, action, recategorized }
        });
    }

    public ruleWritten(ruleId: string, matchType: RuleMatchType, action: RuleAction, recategorized: number): void {
        this.logService.info({
            message: 'spending rule written',
            identifier: RULES_WRITE,
            meta: { ruleId, matchType, action, recategorized }
        });
    }

    public noRecategorizationDriver(): void {
        this.logService.debug({
            message: 'no recategorization driver registered',
            identifier: RULES_WRITE,
            meta: { action: 'recategorization_skipped' }
        });
    }
}
