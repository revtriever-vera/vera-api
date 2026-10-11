export const BULL_PREFIX: string = '{vera}';

export const QUEUES = {
    emailSend: 'vera-email-send',
    catalog: 'vera-catalog'
} as const;

export const MESSAGE_TYPES = {
    emailSendRequested: 'email.send.requested',
    catalogSyncTickRequested: 'catalog.sync.tick.requested',
    catalogSyncSourceRequested: 'catalog.sync.source.requested'
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
