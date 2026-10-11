import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { isAllowedOrigin } from './cors-origin';

export const EXPOSED_HEADERS: readonly string[] = ['Content-Disposition'];

export function buildCorsOptions(isLocal: boolean, allowed: readonly string[]): CorsOptions {
    return {
        origin: (origin: string | undefined, decide: (error: Error | null, allowed?: boolean) => void): void => {
            decide(null, isAllowedOrigin(origin, isLocal, allowed));
        },
        credentials: true,
        exposedHeaders: [...EXPOSED_HEADERS]
    };
}
