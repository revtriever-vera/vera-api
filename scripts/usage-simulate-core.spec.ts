import { describe, expect, it } from 'vitest';
import { assertSimulationAllowed, optionsFrom, simulatedEntryOf } from './usage-simulate-core';

describe('usage-simulate-core', () => {
    it('só roda no local ou no dev', () => {
        expect(() => {
            assertSimulationAllowed({ IS_LOCAL: 'true' });
        }).not.toThrow();
        expect(() => {
            assertSimulationAllowed({ DEPLOY_ENV: 'dev' });
        }).not.toThrow();
        expect(() => {
            assertSimulationAllowed({ IS_LOCAL: 'false', DEPLOY_ENV: 'prod' });
        }).toThrow();
        expect(() => {
            assertSimulationAllowed({});
        }).toThrow();
    });

    it('lê as opções e aplica os padrões', () => {
        expect(optionsFrom(['--company', 'c1', '--percent', '85'])).toEqual({
            companyId: 'c1',
            percent: 85,
            feature: 'ai',
            capMicros: 4_000_000,
            clear: false
        });
        expect(optionsFrom(['--company', 'c1', '--clear'])).toMatchObject({ clear: true });
        expect(optionsFrom(['--company', 'c1', '--percent', '10', '--feature', 'whatsapp', '--cap', '1000000'])).toMatchObject({
            feature: 'whatsapp',
            capMicros: 1_000_000
        });
    });

    it('recusa opções inválidas', () => {
        expect(() => optionsFrom([])).toThrow();
        expect(() => optionsFrom(['--company', 'c1'])).toThrow();
        expect(() => optionsFrom(['--company', 'c1', '--percent', '5', '--feature', 'x'])).toThrow();
    });

    it('a linha simulada leva a porcentagem do teto e uma referência reconhecível', () => {
        const entry = simulatedEntryOf({ companyId: 'c1', percent: 85, feature: 'ai', capMicros: 4_000_000, clear: false });

        expect(entry.costMicros).toBe(3_400_000);
        expect(entry.referenceId.startsWith('qa-sim-')).toBe(true);
    });
});
