import { describe, expect, it } from 'vitest';
import { COMPANY_ID, configOf, fakeHmacHex } from '../../../../test/support/bank-connections-fakes';
import { redactUrl } from '../../../core/observability/url-redaction';
import { PluggyWebhookUrlService } from './pluggy-webhook-url.service';

function serviceOf(base: string | null): PluggyWebhookUrlService {
    return new PluggyWebhookUrlService({ sha256Hex: fakeHmacHex }, configOf({ PLUGGY_WEBHOOK_BASE_URL: base }));
}

describe('PluggyWebhookUrlService', () => {
    it('sem URL pública fica desligado e não gera URL', () => {
        const service: PluggyWebhookUrlService = serviceOf(null);

        expect(service.enabled).toBe(false);
        expect(service.urlFor(COMPANY_ID)).toBeNull();
    });

    it('gera a URL assinada da company e lê a company de volta do token', () => {
        const service: PluggyWebhookUrlService = serviceOf('https://api.vera.example');

        const url: string | null = service.urlFor(COMPANY_ID);

        expect(service.enabled).toBe(true);
        expect(url).toMatch(new RegExp(`^https://api\\.vera\\.example/webhooks/pluggy/${COMPANY_ID}\\.[0-9a-f]{64}$`));
        expect(service.companyOf(service.tokenFor(COMPANY_ID))).toBe(COMPANY_ID);
        expect(service.companyOf(service.tokenFor(COMPANY_ID).toUpperCase())).toBe(COMPANY_ID);
    });

    it.each([
        ['assinatura de outra company', `00000000-0000-4000-8000-0000000000c2.${fakeHmacHex(`pluggy-webhook:${COMPANY_ID}`)}`],
        ['sem assinatura', COMPANY_ID],
        ['assinatura curta', `${COMPANY_ID}.abc`],
        ['company que não é uuid', `empresa.${'a'.repeat(64)}`],
        ['partes demais', `${COMPANY_ID}.${'a'.repeat(64)}.x`]
    ])('recusa o token: %s', (_label: string, token: string) => {
        expect(serviceOf('https://api.vera.example').companyOf(token)).toBeNull();
    });

    it('a URL do webhook sai mascarada dos logs de requisição', () => {
        const service: PluggyWebhookUrlService = serviceOf('https://api.vera.example');

        expect(redactUrl(`/webhooks/pluggy/${service.tokenFor(COMPANY_ID)}`)).toBe('/webhooks/pluggy/<oculto>');
    });
});
