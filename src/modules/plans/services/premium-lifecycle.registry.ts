import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PremiumLifecyclePort } from './premium-lifecycle.port';

@Injectable()
export class PremiumLifecycleRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public handlers(): PremiumLifecyclePort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is PremiumLifecyclePort => instance instanceof PremiumLifecyclePort);
    }

    public handlerNamed(name: string): PremiumLifecyclePort | null {
        return this.handlers().find((handler: PremiumLifecyclePort): boolean => handler.name === name) ?? null;
    }
}
