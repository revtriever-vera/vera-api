import { DiscoveryService } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';
import {
    RecategorizationPort,
    RecategorizationScope,
    RuleMatcher
} from '../../../src/modules/spending-categories/services/recategorization.port';

export class FakeRecategorizationDriver extends RecategorizationPort {
    public readonly scopes: RecategorizationScope[] = [];
    public readonly matchers: RuleMatcher[] = [];

    public constructor(
        private readonly recategorized: number,
        private readonly matches: number
    ) {
        super();
    }

    public async recategorize(scope: RecategorizationScope): Promise<number> {
        this.scopes.push(scope);
        return Promise.resolve(this.recategorized);
    }

    public async countMatches(matcher: RuleMatcher): Promise<number> {
        this.matchers.push(matcher);
        return Promise.resolve(this.matches);
    }
}

export interface DriverRegistration {
    readonly driver: FakeRecategorizationDriver;
    readonly restore: () => void;
}

export function registerFakeDriver(app: INestApplication, recategorized: number, matches: number): DriverRegistration {
    const discovery: DiscoveryService = app.get(DiscoveryService);
    const driver: FakeRecategorizationDriver = new FakeRecategorizationDriver(recategorized, matches);
    const original: DiscoveryService['getProviders'] = discovery.getProviders.bind(discovery);
    const spy = vi
        .spyOn(discovery, 'getProviders')
        .mockImplementation(() => [...original(), { instance: driver } as unknown as ReturnType<DiscoveryService['getProviders']>[number]]);
    return {
        driver,
        restore: (): void => {
            spy.mockRestore();
        }
    };
}
