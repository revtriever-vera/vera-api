import { describe, expect, it } from 'vitest';
import { SignatureVerifier } from './signature.verifier';

const SECRET: string = 'secret-for-spec-only';
const BODY: string = '{"object":"whatsapp_business_account","entry":[]}';

describe('SignatureVerifier', () => {
    const verifier: SignatureVerifier = new SignatureVerifier();

    it('aceita a assinatura válida do corpo', () => {
        expect(verifier.verify(BODY, verifier.sign(BODY, SECRET), SECRET)).toBe(true);
    });

    it('aceita o hex em maiúsculas, que a comparação normaliza', () => {
        const signature: string = verifier.sign(BODY, SECRET);

        expect(verifier.verify(BODY, `sha256=${signature.slice('sha256='.length).toUpperCase()}`, SECRET)).toBe(true);
    });

    it('recusa assinatura de outro segredo', () => {
        expect(verifier.verify(BODY, verifier.sign(BODY, 'other-secret'), SECRET)).toBe(false);
    });

    it('recusa cabeçalho ausente ou vazio', () => {
        expect(verifier.verify(BODY, null, SECRET)).toBe(false);
        expect(verifier.verify(BODY, '', SECRET)).toBe(false);
    });

    it('recusa o corpo alterado em 1 byte', () => {
        const altered: string = BODY.replace('entry', 'entrz');

        expect(verifier.verify(altered, verifier.sign(BODY, SECRET), SECRET)).toBe(false);
    });

    it('recusa cabeçalho de tamanho diferente sem lançar', () => {
        expect(verifier.verify(BODY, 'sha256=abc', SECRET)).toBe(false);
        expect(verifier.safeEqual('a', 'ab')).toBe(false);
    });
});
