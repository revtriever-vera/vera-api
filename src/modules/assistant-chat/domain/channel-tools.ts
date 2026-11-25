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
    'fixed_income_maturities',
    'market_benchmarks'
]);

export const APP_WRITE_TOOLS: ReadonlySet<string> = new Set(['goal_create', 'transaction_categorize']);

const APP_EDITOR_TOOLS: ReadonlySet<string> = new Set([...APP_AI_TOOLS, ...APP_WRITE_TOOLS]);

export function appToolsOf(mode: TurnMode, canEdit: boolean): ReadonlySet<string> {
    if (mode !== TURN_MODES.ai) {
        return APP_HELP_TOOLS;
    }
    return canEdit ? APP_EDITOR_TOOLS : APP_AI_TOOLS;
}
