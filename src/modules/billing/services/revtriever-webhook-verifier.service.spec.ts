import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseBillingConfig } from '../config/billing.config';
import { RevtrieverWebhookVerifier } from './revtriever-webhook-verifier.service';

const NOW: Date = new Date('2026-11-10T12:00:00Z');
const BODY: string = '{"id":"evt-1"}';
const CURRENT: string = 'segredo-atual-123456';
const OLD: string = 'segredo-antigo-123456';

function signed(secret: string, at: Date, body: string = BODY): string {
    const timestamp: number = Math.floor(at.getTime() / 1000);
    return `t=${String(timestamp)},v1=${createHmac('sha256', secret)
        .update(`${String(timestamp)}.${body}`)
        .digest('hex')}`;
}

function verifier(env: NodeJS.ProcessEnv): RevtrieverWebhookVerifier {
    return new RevtrieverWebhookVerifier(parseBillingConfig({ IS_LOCAL: 'false', ...env }));
}

const CONFIGURED: NodeJS.ProcessEnv = { REVTRIEVER_WEBHOOK_TOKEN: 'tok', REVTRIEVER_WEBHOOK_SECRETS: `${CURRENT},${OLD}` };

describe('RevtrieverWebhookVerifier', () => {
    it('aceita token e assinatura do segredo atual', () => {
        expect(verifier(CONFIGURED).refusalOfEvent('tok', BODY, signed(CURRENT, NOW), NOW)).toBeNull();
    });

    it('aceita o segredo antigo durante a rotação', () => {
        expect(verifier(CONFIGURED).refusalOfEvent('tok', BODY, signed(OLD, NOW), NOW)).toBeNull();
    });

    it('recusa token errado, assinatura errada e corpo alterado', () => {
        const target: RevtrieverWebhookVerifier = verifier(CONFIGURED);

        expect(target.refusalOfEvent('outro', BODY, signed(CURRENT, NOW), NOW)).toBe('bad_token');
        expect(target.refusalOfEvent('tok', BODY, signed('segredo-errado-123456', NOW), NOW)).toBe('bad_signature');
        expect(target.refusalOfEvent('tok', '{"id":"evt-2"}', signed(CURRENT, NOW), NOW)).toBe('bad_signature');
        expect(target.refusalOfEvent('tok', BODY, null, NOW)).toBe('bad_signature');
        expect(target.refusalOfEvent('tok', BODY, 'lixo', NOW)).toBe('bad_signature');
    });

    it('recusa assinatura fora da tolerância de 300 segundos, para o passado e para o futuro', () => {
        const target: RevtrieverWebhookVerifier = verifier(CONFIGURED);

        expect(target.refusalOfEvent('tok', BODY, signed(CURRENT, new Date(NOW.getTime() - 301_000)), NOW)).toBe('stale');
        expect(target.refusalOfEvent('tok', BODY, signed(CURRENT, new Date(NOW.getTime() + 301_000)), NOW)).toBe('stale');
        expect(target.refusalOfEvent('tok', BODY, signed(CURRENT, new Date(NOW.getTime() - 299_000)), NOW)).toBeNull();
    });

    it('sem token ou sem segredo configurados nada é aceito', () => {
        expect(verifier({ REVTRIEVER_WEBHOOK_SECRETS: CURRENT }).refusalOfEvent('tok', BODY, signed(CURRENT, NOW), NOW)).toBe(
            'not_configured'
        );
        expect(verifier({ REVTRIEVER_WEBHOOK_TOKEN: 'tok' }).refusalOfEvent('tok', BODY, signed(CURRENT, NOW), NOW)).toBe('not_configured');
        expect(verifier({}).refusalOfSignature(BODY, signed(CURRENT, NOW), NOW)).toBe('not_configured');
    });

    it('a rota de preço confere só a assinatura', () => {
        expect(verifier(CONFIGURED).refusalOfSignature(BODY, signed(CURRENT, NOW), NOW)).toBeNull();
        expect(verifier(CONFIGURED).refusalOfSignature(BODY, signed('x'.repeat(20), NOW), NOW)).toBe('bad_signature');
    });
});
