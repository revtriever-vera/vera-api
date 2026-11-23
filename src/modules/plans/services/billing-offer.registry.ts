import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { BillingOfferPort, BillingOfferSnapshot } from './billing-offer.port';

@Injectable()
export class BillingOfferRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async current(): Promise<BillingOfferSnapshot | null> {
        const port: BillingOfferPort | undefined = this.port();
        return port === undefined ? null : port.offer();
    }

    public async trialStarted(at: Date): Promise<void> {
        await this.port()?.trialStarted(at);
    }

    private port(): BillingOfferPort | undefined {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .find((instance: unknown): instance is BillingOfferPort => instance instanceof BillingOfferPort);
    }
}
