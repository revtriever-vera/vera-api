import { randomUUID } from 'node:crypto';

export type SimulateFeature = 'ai' | 'whatsapp';

export interface SimulateOptions {
    readonly companyId: string;
    readonly percent: number;
    readonly feature: SimulateFeature;
    readonly capMicros: number;
    readonly clear: boolean;
}

export interface SimulatedEntry {
    readonly feature: SimulateFeature;
    readonly referenceId: string;
    readonly costMicros: number;
}

export const SIMULATION_TASK: string = 'qa-simulation';
export const SIMULATION_REFERENCE_PREFIX: string = 'qa-sim-';
const DEFAULT_CAP_MICROS: number = 4_000_000;
const FULL_PERCENT: number = 100;

export function assertSimulationAllowed(env: Readonly<Record<string, string | undefined>>): void {
    if (env['IS_LOCAL'] !== 'true' && env['DEPLOY_ENV'] !== 'dev') {
        throw new Error('usage:simulate só roda com IS_LOCAL=true ou DEPLOY_ENV=dev');
    }
}

function valueOf(args: readonly string[], flag: string): string | undefined {
    const index: number = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
}

export function optionsFrom(args: readonly string[]): SimulateOptions {
    const companyId: string | undefined = valueOf(args, '--company');
    if (companyId === undefined) {
        throw new Error('informe --company <id>');
    }
    const clear: boolean = args.includes('--clear');
    const percent: number = Number(valueOf(args, '--percent') ?? '0');
    if (!clear && !(percent > 0)) {
        throw new Error('informe --percent <n> maior que zero (ou --clear)');
    }
    const feature: string = valueOf(args, '--feature') ?? 'ai';
    if (feature !== 'ai' && feature !== 'whatsapp') {
        throw new Error('--feature deve ser ai ou whatsapp');
    }
    return { companyId, percent, feature, clear, capMicros: Number(valueOf(args, '--cap') ?? String(DEFAULT_CAP_MICROS)) };
}

export function simulatedEntryOf(options: SimulateOptions): SimulatedEntry {
    const reference: string = randomUUID();
    return {
        feature: options.feature,
        referenceId: `${SIMULATION_REFERENCE_PREFIX}${reference}`,
        costMicros: Math.round((options.capMicros * options.percent) / FULL_PERCENT)
    };
}
