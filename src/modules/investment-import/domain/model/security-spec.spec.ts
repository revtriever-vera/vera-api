import { describe, expect, it } from 'vitest';
import { parseSecuritySpec, ParsedSecuritySpec, pickBySecuritySpec, specKeyOf, SpecCandidate } from './security-spec';

const CATALOG: readonly SpecCandidate[] = [
    { symbol: 'PETR3', name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', kind: 'stock' },
    { symbol: 'PETR4', name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', kind: 'stock' },
    { symbol: 'BRDT3', name: 'PETROBRAS DISTRIBUIDORA S.A.', kind: 'stock' },
    { symbol: 'TAEE11', name: 'TRANSMISSORA ALIANCA DE ENERGIA ELETRICA S.A.', kind: 'stock' },
    { symbol: 'HGLG11', name: 'CSHG LOGISTICA FUNDO DE INVESTIMENTO IMOBILIARIO', kind: 'fii' },
    { symbol: 'BOVA11', name: 'ISHARES IBOVESPA FUNDO DE INDICE', kind: 'etf' },
    { symbol: 'AAPL34', name: 'APPLE INC', kind: 'bdr' },
    { symbol: 'ITUB3', name: 'ITAU UNIBANCO HOLDING S.A.', kind: 'stock' },
    { symbol: 'ITUB4', name: 'ITAU UNIBANCO HOLDING S.A.', kind: 'stock' },
    { symbol: 'ITSA4', name: 'ITAUSA S.A.', kind: 'stock' }
];

function pick(spec: string, candidates: readonly SpecCandidate[] = CATALOG): string | null {
    const parsed: ParsedSecuritySpec | null = parseSecuritySpec(spec);
    return parsed === null ? null : pickBySecuritySpec(parsed, candidates);
}

describe('security spec', () => {
    it('normaliza acento, caixa e pontuação', () => {
        expect(specKeyOf('  Petróleo  Brasileiro-S.A. ')).toBe('PETROLEO BRASILEIRO S A');
    });

    it('o sufixo escolhe a classe: ON termina em 3, PN em 4', () => {
        expect(pick('PETROBRAS PN N2')).toBe('PETR4');
        expect(pick('ITAU UNIBANCO ON N1')).toBe('ITUB3');
    });

    it('UNT termina em 11 e o marcador de segmento não atrapalha', () => {
        expect(pick('TRANSMISSORA ALIANCA UNT N2')).toBe('TAEE11');
    });

    it('CI casa com FII e com ETF, pela palavra do nome', () => {
        expect(pick('FII CSHG LOG CI')).toBe('HGLG11');
        expect(pick('ISHARES IBOVESPA CI')).toBe('BOVA11');
    });

    it('DR vira BDR com final 31 a 35 ou 39', () => {
        expect(pick('APPLE DRN')).toBe('AAPL34');
        expect(pick('APPLE DR3')).toBe('AAPL34');
    });

    it('nome que casa mais de um ativo é ambíguo e não adivinha', () => {
        const twins: readonly SpecCandidate[] = [
            { symbol: 'AAAA3', name: 'ALFA ENERGIA', kind: 'stock' },
            { symbol: 'BBBB3', name: 'ALFA ENERGIA', kind: 'stock' }
        ];

        expect(pick('ALFA ON NM', twins)).toBeNull();
    });

    it('palavra inteira do nome vale mais que prefixo, e empate entre empresas não adivinha', () => {
        expect(pick('ITAU PN')).toBe('ITUB4');
        expect(pick('PETROBRAS ON')).toBeNull();
    });

    it('sem sufixo, sem nome ou sem candidato devolve null', () => {
        expect(parseSecuritySpec('PETROBRAS')).toBeNull();
        expect(parseSecuritySpec('PN N2')).toBeNull();
        expect(pick('EMPRESA INEXISTENTE ON NM')).toBeNull();
        expect(pick('PETROBRAS PN N2', [])).toBeNull();
    });
});
