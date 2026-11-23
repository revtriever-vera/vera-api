import { describe, expect, it } from 'vitest';
import { parseNoticesConfig } from './notices.config';

describe('parseNoticesConfig', () => {
    it('defaults to the local addresses', () => {
        expect(parseNoticesConfig({})).toEqual({ PUBLIC_API_URL: 'http://localhost:3333', APP_URL: 'http://localhost:5173' });
    });

    it('drops the trailing slash and treats a blank value as unset', () => {
        expect(parseNoticesConfig({ PUBLIC_API_URL: 'https://api.vera.example/', APP_URL: '  ' })).toEqual({
            PUBLIC_API_URL: 'https://api.vera.example',
            APP_URL: 'http://localhost:5173'
        });
    });
});
