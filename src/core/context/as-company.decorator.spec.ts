import { describe, expect, it } from 'vitest';
import { AlsAppContext } from './als-app-context';
import { AppContext, AppContextData } from './app-context.port';
import { AsCompany, ContextHolder } from './as-company.decorator';

class Sample {
    public seenCompanyId: string | null = null;

    @AsCompany()
    public async runAs(companyId: string): Promise<string | undefined> {
        this.seenCompanyId = ContextHolder.get().get().companyId ?? null;
        return Promise.resolve(companyId);
    }
}

describe('AsCompany', () => {
    it('runs the decorated method inside the tenant context of its first argument', async () => {
        const context: AlsAppContext = new AlsAppContext();
        ContextHolder.set(context);
        const sample: Sample = new Sample();

        await context.run({ requestId: 'req-1', locale: 'pt-BR' }, async () => sample.runAs('company-1'));

        expect(sample.seenCompanyId).toBe('company-1');
    });

    it('restores the outer context once the decorated call finishes', async () => {
        const context: AlsAppContext = new AlsAppContext();
        ContextHolder.set(context);
        const sample: Sample = new Sample();

        const after: AppContextData = await context.run({ requestId: 'req-1', locale: 'pt-BR' }, async () => {
            await sample.runAs('company-1');
            return context.get();
        });

        expect(after.companyId).toBeUndefined();
    });

    it('throws when the first argument is not a companyId string', async () => {
        const context: AlsAppContext = new AlsAppContext();
        ContextHolder.set(context);

        class BadUsage {
            @AsCompany()
            public async runAs(_notACompanyId: number): Promise<void> {
                return Promise.resolve();
            }
        }
        const bad: BadUsage = new BadUsage();

        await context.run({ requestId: 'req-1', locale: 'pt-BR' }, async () => expect(bad.runAs(42)).rejects.toThrow());
    });

    it('ContextHolder.get throws before ContextModule ever calls set', () => {
        const anyHolder: { context: AppContext | null } = ContextHolder as unknown as { context: AppContext | null };
        anyHolder.context = null;

        expect(() => ContextHolder.get()).toThrow('ContextHolder not initialized');
    });
});
