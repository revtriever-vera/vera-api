import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { MonthlyReviewSourcePort, MonthlyReviewSourceView } from './monthly-review-source.port';

@Injectable()
export class MonthlyReviewSourceRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async of(month: string): Promise<MonthlyReviewSourceView | null> {
        for (const port of this.ports()) {
            const found: MonthlyReviewSourceView | null = await port.of(month);
            if (found !== null) {
                return found;
            }
        }
        return null;
    }

    private ports(): MonthlyReviewSourcePort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is MonthlyReviewSourcePort => instance instanceof MonthlyReviewSourcePort);
    }
}
