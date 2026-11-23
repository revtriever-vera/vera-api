import { PENDING_KINDS, PendingKind } from './whatsapp-chat.types';

export const WHATSAPP_CHANNEL_TOOLS: ReadonlySet<string> = new Set([
    'spending_month_summary',
    'spending_by_category',
    'spending_cuts',
    'list_categories',
    'portfolio_overview',
    'contribution_suggestion',
    'calendar_list_events',
    'calendar_create_event',
    'reminder_list',
    'reminder_create',
    'reminder_cancel'
]);

const PENDING_KIND_BY_TOOL: ReadonlyMap<string, PendingKind> = new Map<string, PendingKind>([
    ['calendar_create_event', PENDING_KINDS.calendarCreate],
    ['reminder_create', PENDING_KINDS.reminderCreate],
    ['reminder_cancel', PENDING_KINDS.reminderDelete]
]);

export function pendingKindOfTool(tool: string): PendingKind | null {
    return PENDING_KIND_BY_TOOL.get(tool) ?? null;
}
