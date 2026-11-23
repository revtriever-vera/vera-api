import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { EXPORT_PAGE, NoticePreference } from '../domain/notices.types';

export const NOTICES_EXPORT_AREA: string = 'notices';

export interface NoticePreferenceExport {
    readonly userId: string;
    readonly type: string;
    readonly enabled: boolean;
    readonly updatedAt: string;
}

@Injectable()
export class NoticesAccountExporter extends AccountDataExporterPort {
    public readonly area: string = NOTICES_EXPORT_AREA;

    public constructor(private readonly preferences: NoticePreferenceDomain) {
        super();
    }

    public async exportAll(_companyId: string): Promise<{ readonly preferences: NoticePreferenceExport[] }> {
        const all: NoticePreference[] = [];
        let page: NoticePreference[] = await this.preferences.listAll(0, EXPORT_PAGE);
        while (page.length > 0) {
            all.push(...page);
            page = await this.preferences.listAll(all.length, EXPORT_PAGE);
        }
        return {
            preferences: all.map((row: NoticePreference): NoticePreferenceExport => ({
                userId: row.userId,
                type: row.type,
                enabled: row.enabled,
                updatedAt: row.updatedAt.toISOString()
            }))
        };
    }
}
