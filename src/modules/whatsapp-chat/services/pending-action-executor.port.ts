import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { PendingKind } from '../domain/whatsapp-chat.types';

export abstract class PendingActionExecutorPort {
    public abstract readonly kind: PendingKind;
    public abstract execute(payload: JsonObject): Promise<void>;
    public abstract describe(payload: JsonObject, locale: AppLocale): string;
}
