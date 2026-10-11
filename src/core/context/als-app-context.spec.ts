import { describe, expect, it } from 'vitest';
import { MissingContextError } from './context.errors';
import { AlsAppContext } from './als-app-context';
import { AppContextData } from './app-context.port';

function dataOf(companyId?: string): AppContextData {
    return companyId === undefined ? { requestId: 'req-1', locale: 'pt-BR' } : { requestId: 'req-1', companyId, locale: 'pt-BR' };
}

describe('AlsAppContext', () => {
    it('exposes the data given to run() only inside the callback', () => {
        const context: AlsAppContext = new AlsAppContext();

        const seen: AppContextData = context.run(dataOf('company-1'), () => context.get());

        expect(seen).toEqual(dataOf('company-1'));
    });

    it('isolates concurrent runs from each other', async () => {
        const context: AlsAppContext = new AlsAppContext();

        const [first, second] = await Promise.all([
            context.run(dataOf('company-a'), async () => {
                await Promise.resolve();
                return context.get().companyId;
            }),
            context.run(dataOf('company-b'), async () => {
                await Promise.resolve();
                return context.get().companyId;
            })
        ]);

        expect(first).toBe('company-a');
        expect(second).toBe('company-b');
    });

    it('getOrNull returns null outside of a run scope', () => {
        const context: AlsAppContext = new AlsAppContext();

        expect(context.getOrNull()).toBeNull();
    });

    it('get throws MissingContextError outside of a run scope', () => {
        const context: AlsAppContext = new AlsAppContext();

        expect(() => context.get()).toThrow(MissingContextError);
    });

    it('enrich merges new fields into the current data without touching requestId', () => {
        const context: AlsAppContext = new AlsAppContext();

        const seen: AppContextData = context.run(dataOf(), () => {
            context.enrich({ companyId: 'company-9' });
            return context.get();
        });

        expect(seen).toEqual({ requestId: 'req-1', companyId: 'company-9', locale: 'pt-BR' });
    });

    it('enrich throws outside of a run scope, since there is nothing to merge into', () => {
        const context: AlsAppContext = new AlsAppContext();

        expect(() => {
            context.enrich({ locale: 'en' });
        }).toThrow(MissingContextError);
    });
});
