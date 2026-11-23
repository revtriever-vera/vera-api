import { describe, expect, it } from 'vitest';
import { WHATSAPP_CHANNEL_TOOLS, pendingKindOfTool } from './channel-tools';

describe('channel-tools', () => {
    it('lista leitura de gastos, cortes e carteira, agenda e lembretes, e nada além', () => {
        expect([...WHATSAPP_CHANNEL_TOOLS].sort()).toEqual([
            'calendar_create_event',
            'calendar_list_events',
            'contribution_suggestion',
            'list_categories',
            'portfolio_overview',
            'reminder_cancel',
            'reminder_create',
            'reminder_list',
            'spending_by_category',
            'spending_cuts',
            'spending_month_summary'
        ]);
    });

    it('só as ferramentas que escrevem viram ação pendente', () => {
        expect(pendingKindOfTool('calendar_create_event')).toBe('calendar_create');
        expect(pendingKindOfTool('reminder_create')).toBe('reminder_create');
        expect(pendingKindOfTool('reminder_cancel')).toBe('reminder_delete');
        expect(pendingKindOfTool('spending_cuts')).toBeNull();
    });
});
