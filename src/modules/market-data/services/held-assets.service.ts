import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { HeldAssetsPort } from '../ports/held-assets.port';

@Injectable()
export class HeldAssetsService {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async listHeldAssetIds(): Promise<string[]> {
        const lists: (readonly string[])[] = await Promise.all(
            this.ports().map(async (port: HeldAssetsPort): Promise<readonly string[]> => port.listHeldAssetIdsAcrossTenants())
        );
        return [...new Set<string>(lists.flat())].sort();
    }

    private ports(): HeldAssetsPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is HeldAssetsPort => instance instanceof HeldAssetsPort);
    }
}
