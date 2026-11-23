import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { IntegrationKind } from '../domain/integration.types';
import { IntegrationRemovedPort } from './integration-removed.port';

@Injectable()
export class IntegrationRemovedRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async notify(kind: IntegrationKind): Promise<void> {
        const ports: IntegrationRemovedPort[] = this.ports().filter((port: IntegrationRemovedPort): boolean => port.kind === kind);
        for (const port of ports) {
            await port.onRemoved();
        }
    }

    private ports(): IntegrationRemovedPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is IntegrationRemovedPort => instance instanceof IntegrationRemovedPort);
    }
}
