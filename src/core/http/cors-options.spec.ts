import { describe, expect, it, vi } from 'vitest';
import { buildCorsOptions } from './cors-options';

describe('buildCorsOptions', () => {
    it('exposes Content-Disposition so the browser can read the export filename', () => {
        expect(buildCorsOptions(false, []).exposedHeaders).toContain('Content-Disposition');
    });

    it('keeps credentials on', () => {
        expect(buildCorsOptions(false, []).credentials).toBe(true);
    });

    it('decides the origin through the allow list', () => {
        const options = buildCorsOptions(false, ['https://app.vera.example']);
        const decide = vi.fn();
        const check = options.origin as (origin: string, decide: (error: Error | null, allowed?: boolean) => void) => void;

        check('https://app.vera.example', decide);
        check('https://evil.example', decide);

        expect(decide).toHaveBeenNthCalledWith(1, null, true);
        expect(decide).toHaveBeenNthCalledWith(2, null, false);
    });
});
