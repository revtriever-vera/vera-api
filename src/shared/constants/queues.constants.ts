export const QUEUES = {
    emailSend: 'vera-email-send',
    catalog: 'vera-catalog',
    fixedIncome: 'vera-fixed-income',
    marketData: 'vera-market-data',
    bankConnections: 'vera-bank-connections',
    plans: 'vera-plans',
    identity: 'vera-identity',
    usage: 'vera-usage',
    whatsapp: 'vera-whatsapp'
} as const;

export const MESSAGE_TYPES = {
    emailSendRequested: 'email.send.requested',
    catalogSyncTickRequested: 'catalog.sync.tick.requested',
    catalogSyncSourceRequested: 'catalog.sync.source.requested',
    fixedIncomeIndexSyncRequested: 'fixed-income.index-sync.requested',
    fixedIncomeIndexSyncSeriesRequested: 'fixed-income.index-sync.series.requested',
    marketDataQuotesSweepRequested: 'market-data.quotes.sweep.requested',
    marketDataQuotesChunkRequested: 'market-data.quotes.chunk.requested',
    marketDataReferenceRequested: 'market-data.reference.requested',
    marketDataPtaxRequested: 'market-data.ptax.requested',
    marketDataQuoteOndemandRequested: 'market-data.quote.ondemand.requested',
    bankConnectionsSyncDailyRequested: 'bank-connections.sync.daily.requested',
    bankConnectionsSyncRequested: 'bank-connections.sync.requested',
    plansPremiumEndedSweepRequested: 'plans.premium-ended.sweep.requested',
    plansPremiumEndedRetryRequested: 'plans.premium-ended.retry.requested',
    identityMembersCleanupRequested: 'identity.members.cleanup.requested',
    usageThresholdCrossed: 'usage.threshold.crossed',
    usageCleanupRequested: 'usage.cleanup.requested',
    usageGaugeRequested: 'usage.gauge.requested',
    whatsappWebhookReceived: 'whatsapp.webhook.received',
    whatsappInboundReceived: 'whatsapp.inbound.received',
    whatsappStatusReceived: 'whatsapp.status.received',
    whatsappSendRequested: 'whatsapp.send.requested',
    whatsappTemplatesSyncRequested: 'whatsapp.templates.sync.requested',
    whatsappHealthRequested: 'whatsapp.health.requested',
    whatsappRetentionRequested: 'whatsapp.retention.requested'
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
