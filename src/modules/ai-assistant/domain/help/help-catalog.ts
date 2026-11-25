import { PORTFOLIO_HELP_ENTRIES } from './help-entries-portfolio';
import { PRODUCT_HELP_ENTRIES } from './help-entries-product';
import { SETTINGS_HELP_ENTRIES } from './help-entries-settings';
import { SPENDING_HELP_ENTRIES } from './help-entries-spending';
import { HelpEntry } from './help.types';

export const HELP_CATALOG: readonly HelpEntry[] = [
    ...PORTFOLIO_HELP_ENTRIES,
    ...SPENDING_HELP_ENTRIES,
    ...SETTINGS_HELP_ENTRIES,
    ...PRODUCT_HELP_ENTRIES
];

export const HELP_ROUTES: ReadonlySet<string> = new Set(
    HELP_CATALOG.flatMap((entry: HelpEntry): string[] => (entry.screen === undefined ? [] : [entry.screen.path]))
);
