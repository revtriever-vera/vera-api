import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RecategorizationPort, RecategorizationScope, RuleMatcher } from './recategorization.port';
import { RecategorizationRegistry } from './recategorization.registry';
import { SpendingCategoriesLogService } from './spending-categories-log.service';

class FakeDriver extends RecategorizationPort {
    public readonly scopes: RecategorizationScope[] = [];

    public async recategorize(scope: RecategorizationScope): Promise<number> {
        this.scopes.push(scope);
        return Promise.resolve(7);
    }

    public async countMatches(_matcher: RuleMatcher): Promise<number> {
        return Promise.resolve(3);
    }
}

function build(instances: unknown[]): { registry: RecategorizationRegistry; noDriver: ReturnType<typeof vi.fn> } {
    const noDriver: ReturnType<typeof vi.fn> = vi.fn();
    const discovery: DiscoveryService = {
        getProviders: () => instances.map((instance: unknown) => ({ instance }))
    } as unknown as DiscoveryService;
    return {
        registry: new RecategorizationRegistry(discovery, {
            noRecategorizationDriver: noDriver
        } as unknown as SpendingCategoriesLogService),
        noDriver
    };
}

const MATCHER: RuleMatcher = { matchType: 'contains', pattern: 'PADARIA', appliesTo: 'out' };

describe('RecategorizationRegistry', () => {
    it('sem driver registrado devolve 0 e loga em debug', async () => {
        const { registry, noDriver } = build([{}, null, undefined]);

        await expect(registry.recategorize({ kind: 'rule_saved', ruleId: 'r1' })).resolves.toBe(0);
        await expect(registry.countMatches(MATCHER)).resolves.toBe(0);
        expect(noDriver).toHaveBeenCalledTimes(2);
    });

    it('usa a primeira implementação registrada', async () => {
        const first: FakeDriver = new FakeDriver();
        const second: FakeDriver = new FakeDriver();
        const { registry, noDriver } = build([{}, first, second]);

        await expect(registry.recategorize({ kind: 'category_removed', categoryId: 'c1', moveToCategoryId: null })).resolves.toBe(7);
        await expect(registry.countMatches(MATCHER)).resolves.toBe(3);
        expect(first.scopes).toEqual([{ kind: 'category_removed', categoryId: 'c1', moveToCategoryId: null }]);
        expect(second.scopes).toEqual([]);
        expect(noDriver).not.toHaveBeenCalled();
    });
});
