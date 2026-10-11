export const COMMAND_KEYS = {
    catalogSyncWeekly: 'catalog-sync-weekly-command',
    catalogSyncTesouroDaily: 'catalog-sync-tesouro-daily-command',
    fixedIncomeIndexSync: 'fixed-income-index-sync-command'
} as const;

export type CommandKey = (typeof COMMAND_KEYS)[keyof typeof COMMAND_KEYS];

export const CRON = {
    everyFiveMinutes: '*/5 * * * *',
    everyFifteenMinutes: '*/15 * * * *',
    everyThirtyMinutes: '*/30 * * * *',
    everyHour: '0 * * * *',
    everySixHours: '0 */6 * * *',
    everyDayAtMidnight: '0 0 * * *',
    everyDayAtSixAm: '0 6 * * *',
    everyDayAtFourAm: '0 4 * * *',
    everyDayAtSevenAm: '0 7 * * *',
    everyDayAtNineAm: '0 9 * * *',
    everyDayAtNineThirtyAm: '30 9 * * *',
    twiceDaily: '0 9,21 * * *',
    everyMondayAtSixAm: '0 6 * * 1'
} as const;

export const CRON_TIMEZONE: string = 'America/Sao_Paulo';
