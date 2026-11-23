import { Injectable } from '@nestjs/common';
import { NoticePreferencesRepository } from '../repositories/notice-preferences.repository';
import { NoticePreference } from './notices.types';

@Injectable()
export class NoticePreferenceDomain {
    public constructor(private readonly preferences: NoticePreferencesRepository) {}

    public async set(userId: string, type: string, enabled: boolean): Promise<NoticePreference> {
        return this.preferences.set(userId, type, enabled);
    }

    public async enabledTypesOf(userId: string, types: readonly string[]): Promise<Map<string, boolean>> {
        const stored: Map<string, boolean> = new Map(
            (await this.preferences.listOfUser(userId)).map((row: NoticePreference): [string, boolean] => [row.type, row.enabled])
        );
        return new Map(types.map((type: string): [string, boolean] => [type, stored.get(type) ?? true]));
    }

    public async disabledUserIds(type: string): Promise<Set<string>> {
        return new Set((await this.preferences.listDisabled(type)).map((row: NoticePreference): string => row.userId));
    }

    public async listAll(offset: number, limit: number): Promise<NoticePreference[]> {
        return this.preferences.listAll(offset, limit);
    }

    public async removeOfUser(userId: string): Promise<number> {
        return this.preferences.removeOfUser(userId);
    }
}
