import { AppLocale } from '../../../shared/i18n/locale';
import { SYSTEM_CLASS_KEYS, SystemClassKey } from './allocation.types';

export const DEFAULT_CLASS_NAMES: Readonly<Record<SystemClassKey, Readonly<Record<AppLocale, string>>>> = {
    [SYSTEM_CLASS_KEYS.rfPos]: { 'pt-BR': 'Renda fixa pós', en: 'Floating-rate fixed income' },
    [SYSTEM_CLASS_KEYS.rfPre]: { 'pt-BR': 'Renda fixa pré', en: 'Fixed-rate fixed income' },
    [SYSTEM_CLASS_KEYS.rfIpca]: { 'pt-BR': 'Renda fixa IPCA+', en: 'Inflation-linked fixed income' },
    [SYSTEM_CLASS_KEYS.acoesBr]: { 'pt-BR': 'Ações Brasil', en: 'Brazilian stocks' },
    [SYSTEM_CLASS_KEYS.fii]: { 'pt-BR': 'FIIs', en: 'Brazilian REITs (FIIs)' },
    [SYSTEM_CLASS_KEYS.acoesEua]: { 'pt-BR': 'Ações EUA', en: 'US stocks' },
    [SYSTEM_CLASS_KEYS.reits]: { 'pt-BR': 'REITs', en: 'US REITs' },
    [SYSTEM_CLASS_KEYS.cripto]: { 'pt-BR': 'Cripto', en: 'Crypto' }
};

export function isSystemClassKey(value: string): value is SystemClassKey {
    return Object.hasOwn(DEFAULT_CLASS_NAMES, value);
}
