export const QUEUES = {
    emailSend: 'vera-email-send',
    catalog: 'vera-catalog',
    fixedIncome: 'vera-fixed-income',
    marketData: 'vera-market-data'
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
    marketDataQuoteOndemandRequested: 'market-data.quote.ondemand.requested'
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
