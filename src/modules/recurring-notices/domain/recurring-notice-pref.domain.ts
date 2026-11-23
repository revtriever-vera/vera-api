import { Injectable } from '@nestjs/common';
import { RecurringNoticePrefsRepository } from '../repositories/recurring-notice-prefs.repository';
import { RecurringNoticePref } from './recurring-notices.types';

@Injectable()
export class RecurringNoticePrefDomain {
    public constructor(private readonly prefs: RecurringNoticePrefsRepository) {}

    public async set(userId: string, seriesId: string, enabled: boolean): Promise<void> {
        await this.prefs.set(userId, seriesId, enabled);
    }

    public async isEnabled(userId: string, seriesId: string): Promise<boolean> {
        return (await this.prefs.findOfUser(userId, seriesId))?.enabled === true;
    }

    public async enabledSeriesIdsOf(userId: string): Promise<string[]> {
        return (await this.prefs.listEnabledOfUser(userId)).map((row: RecurringNoticePref): string => row.seriesId);
    }

    public async listEnabled(): Promise<RecurringNoticePref[]> {
        return this.prefs.listEnabled();
    }

    public async listAll(offset: number, limit: number): Promise<RecurringNoticePref[]> {
        return this.prefs.listAll(offset, limit);
    }

    public async removeOfUser(userId: string): Promise<number> {
        return this.prefs.removeOfUser(userId);
    }
}
