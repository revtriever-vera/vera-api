import { AppLocale } from '../../../shared/i18n/locale';

export type ReminderButtonAction = 'done' | 'snooze1h' | 'tomorrow';

export abstract class ReminderCommandsPort {
    public abstract list(locale: AppLocale): Promise<string>;
    public abstract remove(index: number, locale: AppLocale): Promise<string>;
    public abstract apply(action: ReminderButtonAction, reminderId: string, locale: AppLocale): Promise<string>;
}
