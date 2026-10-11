import { describe, expect, it } from 'vitest';
import { CommandKey } from '../../shared/constants/commands.constants';
import { QueueName } from '../../shared/constants/queues.constants';
import { BaseCommand } from './base.command';

class SampleCommand extends BaseCommand {
    public readonly key: CommandKey = 'sample-command' as unknown as CommandKey;
    public readonly queue: QueueName = 'sample-queue' as unknown as QueueName;
    public readonly type: string = 'sample.type';
    public readonly pattern: string = '*/5 * * * *';
}

describe('BaseCommand', () => {
    it('defaults payload to an empty object when a command does not override it', () => {
        const command: SampleCommand = new SampleCommand();

        expect(command.payload).toEqual({});
    });
});
