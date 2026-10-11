import { CommandKey } from '../../shared/constants/commands.constants';
import { QueueName } from '../../shared/constants/queues.constants';

export abstract class BaseCommand {
    public abstract readonly key: CommandKey;
    public abstract readonly queue: QueueName;
    public abstract readonly type: string;
    public abstract readonly pattern: string;

    public get payload(): Readonly<Record<string, unknown>> {
        return {};
    }
}
