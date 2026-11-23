import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { ReminderCancellationPort } from './reminder-cancellation.port';

@Injectable()
export class ReminderCancellationRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async cancelForLink(linkId: string): Promise<number> {
        let canceled: number = 0;
        for (const port of this.ports()) {
            canceled += await port.cancelForLink(linkId);
        }
        return canceled;
    }

    private ports(): ReminderCancellationPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is ReminderCancellationPort => instance instanceof ReminderCancellationPort);
    }
}
