import { MESSAGE_STATUSES, MessageStatus } from './whatsapp.types';

const RANK: ReadonlyMap<MessageStatus, number> = new Map<MessageStatus, number>([
    [MESSAGE_STATUSES.sent, 1],
    [MESSAGE_STATUSES.delivered, 2],
    [MESSAGE_STATUSES.read, 3]
]);

export function statusesBefore(next: MessageStatus): MessageStatus[] {
    if (next === MESSAGE_STATUSES.failed) {
        return [MESSAGE_STATUSES.sending, MESSAGE_STATUSES.sent];
    }
    const target: number = RANK.get(next) ?? 0;
    const earlier: MessageStatus[] = [...RANK.entries()]
        .filter(([, rank]: [MessageStatus, number]): boolean => rank < target)
        .map(([status]: [MessageStatus, number]): MessageStatus => status);
    return target === 0 ? [] : [MESSAGE_STATUSES.sending, ...earlier];
}
