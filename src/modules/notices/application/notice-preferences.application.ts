import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { NoticeTypeRegistry } from '../services/notice-type.registry';
import { NoticePreferencesView, NoticeSettingView } from '../validation/notices.schemas';

@Injectable()
export class NoticePreferencesApplication {
    public constructor(
        private readonly types: NoticeTypeRegistry,
        private readonly preferences: NoticePreferenceDomain,
        private readonly context: AppContext
    ) {}

    public async list(): Promise<NoticePreferencesView> {
        const types: string[] = this.types.types();
        const enabled: Map<string, boolean> = await this.preferences.enabledTypesOf(this.userId(), types);
        return { items: types.map((type: string): NoticeSettingView => ({ type, enabled: enabled.get(type) ?? true })) };
    }

    public async update(type: string, enabled: boolean): Promise<NoticeSettingView> {
        this.types.require(type);
        await this.preferences.set(this.userId(), type, enabled);
        return { type, enabled };
    }

    private userId(): string {
        return this.context.get().userId ?? '';
    }
}
