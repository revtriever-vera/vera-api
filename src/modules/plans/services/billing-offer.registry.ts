import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { BillingOfferPort, BillingOfferSnapshot, UsableOffer } from './billing-offer.port';

@Injectable()
export class BillingOfferRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async current(): Promise<BillingOfferSnapshot | null> {
        return this.port()?.offer() ?? null;
    }

    public async trialStarted(at: Date): Promise<void> {
        await this.port()?.trialStarted(at);
    }

    public async usable(): Promise<UsableOffer | null> {
        return this.port()?.usable() ?? null;
    }

    public async markApplied(): Promise<boolean> {
        return (await this.port()?.markApplied()) ?? false;
    }

    public async release(): Promise<void> {
        await this.port()?.release();
    }

    private port(): BillingOfferPort | undefined {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .find((instance: unknown): instance is BillingOfferPort => instance instanceof BillingOfferPort);
    }
}
