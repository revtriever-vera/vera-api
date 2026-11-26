import { ACTION_STATUSES, ActionStatus, AssistantPendingAction } from './assistant-chat.types';
import type { ActionSummaryView } from '../validation/assistant-chat.schemas';

export function statusOf(action: Pick<AssistantPendingAction, 'status' | 'expiresAt'>, now: Date): ActionStatus {
    const lapsed: boolean = action.status === ACTION_STATUSES.open && action.expiresAt.getTime() <= now.getTime();
    return lapsed ? ACTION_STATUSES.expired : (action.status as ActionStatus);
}

function referenceOf(payload: unknown): string | null {
    const reference: unknown = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)['reference'] : null;
    return typeof reference === 'string' ? reference : null;
}

export function actionSummaryOf(action: AssistantPendingAction, now: Date): ActionSummaryView {
    return {
        id: action.id,
        tool: action.tool,
        summary: action.summary,
        status: statusOf(action, now),
        expiresAt: action.expiresAt.toISOString(),
        resultText: action.resultText,
        reference: referenceOf(action.payload)
    };
}
