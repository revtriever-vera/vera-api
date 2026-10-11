export const BULL_PREFIX: string = '{vera}';

export const QUEUES = {
    emailSend: 'vera-email-send'
} as const;

export const MESSAGE_TYPES = {
    emailSendRequested: 'email.send.requested'
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
