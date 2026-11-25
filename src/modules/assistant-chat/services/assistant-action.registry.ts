import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AssistantActionExecutorPort } from './assistant-action-executor.port';

@Injectable()
export class AssistantActionRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public executorFor(tool: string): AssistantActionExecutorPort | null {
        return (
            this.discovery
                .getProviders()
                .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
                .filter((instance: unknown): instance is AssistantActionExecutorPort => instance instanceof AssistantActionExecutorPort)
                .find((executor: AssistantActionExecutorPort): boolean => executor.tool === tool) ?? null
        );
    }
}
