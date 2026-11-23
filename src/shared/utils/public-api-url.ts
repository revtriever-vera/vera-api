import { stripTrailing } from './strip-trailing';

/** A API roda no próprio host e não tem prefixo global: nenhuma URL pública leva `/api`. */
export function publicApiUrl(base: string, path: string): string {
    return `${stripTrailing(base, '/')}/${path.replace(/^\/+/, '')}`;
}
