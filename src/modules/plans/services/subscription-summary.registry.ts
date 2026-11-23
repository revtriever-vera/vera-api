import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { SubscriptionSnapshot } from '../domain/plans.types';
import { SubscriptionSummaryPort } from './subscription-summary.port';

@Injectable()
export class SubscriptionSummaryRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async current(): Promise<SubscriptionSnapshot | null> {
        const port: SubscriptionSummaryPort | undefined = this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .find((instance: unknown): instance is SubscriptionSummaryPort => instance instanceof SubscriptionSummaryPort);
        return port === undefined ? null : port.summary();
    }
}
