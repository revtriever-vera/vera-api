export abstract class ReminderCancellationPort {
    public abstract cancelForLink(linkId: string): Promise<number>;
}
