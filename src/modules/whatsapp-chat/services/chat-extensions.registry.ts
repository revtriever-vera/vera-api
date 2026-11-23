import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PendingKind } from '../domain/whatsapp-chat.types';
import { PendingActionExecutorPort } from './pending-action-executor.port';
import { ReminderCommandsPort } from './reminder-commands.port';

@Injectable()
export class ChatExtensionsRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public executorFor(kind: PendingKind): PendingActionExecutorPort | null {
        return (
            this.instances(PendingActionExecutorPort).find((executor: PendingActionExecutorPort): boolean => executor.kind === kind) ?? null
        );
    }

    public reminders(): ReminderCommandsPort | null {
        return this.instances(ReminderCommandsPort)[0] ?? null;
    }

    private instances<T>(type: abstract new () => T): T[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is T => instance instanceof type);
    }
}
