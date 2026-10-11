import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { RecategorizationPort, RecategorizationScope, RuleMatcher } from './recategorization.port';
import { SpendingCategoriesLogService } from './spending-categories-log.service';

@Injectable()
export class RecategorizationRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly logs: SpendingCategoriesLogService
    ) {}

    public async recategorize(scope: RecategorizationScope): Promise<number> {
        const driver: RecategorizationPort | null = this.driver();
        if (driver === null) {
            this.logs.noRecategorizationDriver();
            return 0;
        }
        return driver.recategorize(scope);
    }

    public async countMatches(matcher: RuleMatcher): Promise<number> {
        const driver: RecategorizationPort | null = this.driver();
        if (driver === null) {
            this.logs.noRecategorizationDriver();
            return 0;
        }
        return driver.countMatches(matcher);
    }

    private driver(): RecategorizationPort | null {
        const found: unknown = this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .find((instance: unknown): boolean => instance instanceof RecategorizationPort);
        return found instanceof RecategorizationPort ? found : null;
    }
}
