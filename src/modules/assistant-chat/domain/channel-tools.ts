import { DATA_LOCKED_TOOL } from '../../ai-assistant/services/tools/data-locked.tool';
import { TURN_MODES, TurnMode } from './assistant-chat.types';

const HELP_TOOLS: readonly string[] = ['help_search', 'where_is'];

export const APP_HELP_ONLY_TOOLS: readonly string[] = [DATA_LOCKED_TOOL];

export const APP_HELP_TOOLS: ReadonlySet<string> = new Set([...HELP_TOOLS, ...APP_HELP_ONLY_TOOLS]);

export const APP_AI_TOOLS: ReadonlySet<string> = new Set([
    ...HELP_TOOLS,
    'spending_month_summary',
    'spending_by_category',
    'spending_cuts',
    'list_categories',
    'portfolio_overview',
    'contribution_suggestion',
    'goals_overview',
    'recurring_overview',
    'concentration_overview',
    'fixed_income_maturities'
]);

export function appToolsOf(mode: TurnMode): ReadonlySet<string> {
    return mode === TURN_MODES.ai ? APP_AI_TOOLS : APP_HELP_TOOLS;
}
