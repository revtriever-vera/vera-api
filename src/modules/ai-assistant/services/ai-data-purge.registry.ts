import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AiDataPurgePort } from './ai-data-purge.port';

@Injectable()
export class AiDataPurgeRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async purgeAll(): Promise<number> {
        let purged: number = 0;
        for (const port of this.ports()) {
            purged += await port.purge();
        }
        return purged;
    }

    private ports(): AiDataPurgePort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is AiDataPurgePort => instance instanceof AiDataPurgePort);
    }
}
