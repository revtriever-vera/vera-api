import { AppLocale } from '../../shared/i18n/locale';

export interface AppContextData {
    readonly requestId: string;
    readonly companyId?: string;
    readonly userId?: string;
    readonly sessionId?: string;
    readonly locale: AppLocale;
}

export abstract class AppContext {
    public abstract run<T>(data: AppContextData, fn: () => T): T;
    public abstract get(): AppContextData;
    public abstract getOrNull(): AppContextData | null;
    public abstract enrich(data: Partial<Omit<AppContextData, 'requestId'>>): void;
}
