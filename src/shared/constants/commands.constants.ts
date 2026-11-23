export const COMMAND_KEYS = {
    catalogSyncWeekly: 'catalog-sync-weekly-command',
    catalogSyncTesouroDaily: 'catalog-sync-tesouro-daily-command',
    fixedIncomeIndexSync: 'fixed-income-index-sync-command',
    marketDataQuotesSweep: 'market-data-quotes-sweep-command',
    marketDataReferenceDaily: 'market-data-reference-daily-command',
    marketDataPtaxAfternoon: 'market-data-ptax-afternoon-command',
    bankConnectionsSyncDaily: 'bank-connections-sync-daily-command',
    plansPremiumEndedSweep: 'plans-premium-ended-sweep-command',
    identityMembersCleanup: 'identity-members-cleanup-command',
    usageCleanup: 'usage-cleanup-command',
    usageGauge: 'usage-gauge-command',
    aiSummariesRetention: 'ai-summaries-retention-command',
    whatsappTemplatesSync: 'whatsapp-templates-sync-command',
    whatsappHealth: 'whatsapp-health-command',
    whatsappRetention: 'whatsapp-retention-command',
    whatsappLinksStale: 'whatsapp-links-stale-command',
    remindersSweep: 'reminders-sweep-command',
    remindersGauge: 'reminders-gauge-command'
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
    everyMondayAtSixAm: '0 6 * * 1',
    everyDayAtTenThirtyPm: '30 22 * * *',
    weekdaysAtTwoThirtyPm: '30 14 * * 1-5',
    firstOfMonthAtFourAm: '0 4 1 * *'
} as const;

export const CRON_TIMEZONE: string = 'America/Sao_Paulo';
