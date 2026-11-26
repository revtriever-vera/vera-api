import { describe, expect, it } from 'vitest';
import { summaryPayloadOf, summaryRequestOf } from './market-document-summary.request';
import { SummarySubject } from './market-document-summary.types';

const SUBJECT: SummarySubject = {
    issuerName: 'Petrobras',
    tickers: ['PETR3', 'PETR4'],
    category: 'relevant_fact',
    publishedAt: '2026-11-20',
    text: 'A Companhia informa.'
};
const ACCOUNT_FIELD: RegExp = /company|user|account|tenant|email|session|owner/i;

describe('summaryRequestOf', () => {
    it('monta a requisição sem nenhum campo de conta, nem no envelope nem no JSON de entrada', () => {
        const request = summaryRequestOf('doc-1', SUBJECT, 'pt-BR', 1);
        const payload: Record<string, unknown> = JSON.parse(summaryPayloadOf(SUBJECT, 'pt-BR')) as Record<string, unknown>;

        expect(Object.keys(request).filter((key: string): boolean => ACCOUNT_FIELD.test(key))).toEqual([]);
        expect(Object.keys(payload).filter((key: string): boolean => ACCOUNT_FIELD.test(key))).toEqual([]);
        expect(Object.keys(payload).sort()).toEqual(['category', 'issuer', 'language', 'publishedAt', 'text', 'tickers']);
        expect(request.referenceId).toBe('market-doc:doc-1:pt-BR:1');
        expect(request.feature).toBe('market_docs');
    });

    it('o prompt manda não escrever o aviso e proíbe conselho nos dois idiomas', () => {
        for (const locale of ['pt-BR', 'en'] as const) {
            const system: string = summaryRequestOf('doc-1', SUBJECT, locale, 1).system;

            expect(system.length).toBeGreaterThan(200);
            expect(system).toContain('relevant_fact');
        }
    });
});
