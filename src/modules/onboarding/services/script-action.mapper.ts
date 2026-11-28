import { ScriptAction } from '../domain/script/script.types';
import { ConversationActionBody } from '../validation/onboarding-conversation.schemas';

export function scriptActionOf(body: ConversationActionBody): ScriptAction {
    switch (body.type) {
        case 'CHOOSE_MODULES':
            return { type: body.type, portfolio: body.portfolio === true, spending: body.spending === true };
        case 'TEXT':
            return { type: body.type, text: body.text ?? '' };
        default:
            return { type: body.type };
    }
}
