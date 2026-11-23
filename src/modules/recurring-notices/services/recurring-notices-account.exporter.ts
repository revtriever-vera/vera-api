import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { RecurringNoticePrefDomain } from '../domain/recurring-notice-pref.domain';
import { EXPORT_PAGE, RecurringNoticePref } from '../domain/recurring-notices.types';

export const RECURRING_NOTICES_EXPORT_AREA: string = 'recurring-notices';

export interface RecurringNoticePrefExport {
    readonly userId: string;
    readonly seriesId: string;
    readonly enabled: boolean;
    readonly updatedAt: string;
}

@Injectable()
export class RecurringNoticesAccountExporter extends AccountDataExporterPort {
    public readonly area: string = RECURRING_NOTICES_EXPORT_AREA;

    public constructor(private readonly prefs: RecurringNoticePrefDomain) {
        super();
    }

    public async exportAll(_companyId: string): Promise<{ readonly preferences: RecurringNoticePrefExport[] }> {
        const all: RecurringNoticePref[] = [];
        let page: RecurringNoticePref[] = await this.prefs.listAll(0, EXPORT_PAGE);
        while (page.length > 0) {
            all.push(...page);
            page = await this.prefs.listAll(all.length, EXPORT_PAGE);
        }
        return {
            preferences: all.map((row: RecurringNoticePref): RecurringNoticePrefExport => ({
                userId: row.userId,
                seriesId: row.seriesId,
                enabled: row.enabled,
                updatedAt: row.updatedAt.toISOString()
            }))
        };
    }
}
