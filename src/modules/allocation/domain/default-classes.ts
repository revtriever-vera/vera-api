import { ClassColorKey, SYSTEM_CLASS_KEYS, SystemClassKey } from './allocation.types';

export interface DefaultClassSeed {
    readonly systemKey: SystemClassKey;
    readonly targetBps: number;
    readonly colorKey: ClassColorKey;
    readonly sortOrder: number;
}

export const DEFAULT_CLASSES: readonly DefaultClassSeed[] = [
    { systemKey: SYSTEM_CLASS_KEYS.rfPos, targetBps: 2000, colorKey: 'c1', sortOrder: 1 },
    { systemKey: SYSTEM_CLASS_KEYS.rfPre, targetBps: 800, colorKey: 'c2', sortOrder: 2 },
    { systemKey: SYSTEM_CLASS_KEYS.rfIpca, targetBps: 1200, colorKey: 'c3', sortOrder: 3 },
    { systemKey: SYSTEM_CLASS_KEYS.acoesBr, targetBps: 1500, colorKey: 'c4', sortOrder: 4 },
    { systemKey: SYSTEM_CLASS_KEYS.fii, targetBps: 700, colorKey: 'c5', sortOrder: 5 },
    { systemKey: SYSTEM_CLASS_KEYS.acoesEua, targetBps: 2500, colorKey: 'c6', sortOrder: 6 },
    { systemKey: SYSTEM_CLASS_KEYS.reits, targetBps: 800, colorKey: 'c7', sortOrder: 7 },
    { systemKey: SYSTEM_CLASS_KEYS.cripto, targetBps: 500, colorKey: 'c8', sortOrder: 8 }
];

export const DEFAULT_SYSTEM_KEYS: readonly SystemClassKey[] = DEFAULT_CLASSES.map((seed: DefaultClassSeed) => seed.systemKey);
