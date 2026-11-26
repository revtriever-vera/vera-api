import { LlmTaskSpec } from '../../src/core/llm/catalog/llm-task.types';
import { LlmDriverResult } from '../../src/core/llm/drivers/llm-driver';
import { parseJsonObject } from '../../src/core/llm/structured-output';
import { serializeContext } from '../../src/modules/ai-assistant/domain/context/context-hash';
import { evidenceOf } from './ask-fixtures';
import { EvalCase, isAskCase, isDocumentCase } from './case.schemas';
import { Engine } from './engine';
import { costOf } from './generate';

export interface JudgeVerdict {
    readonly score: number;
    readonly reason: string;
    readonly costUsd: number;
}

const MIN_SCORE: number = 1;
const MAX_SCORE: number = 5;
const JUDGE_MAX_OUTPUT_TOKENS: number = 2048;
const MOCK_VERDICT: string = JSON.stringify({ score: MAX_SCORE, reason: 'mock judge' });

const RUBRIC: string = [
    'You grade a short financial summary written for a person, against the JSON the summary was written from.',
    'Criteria: (1) fidelity: every number comes from the JSON and means what the JSON says; (2) clarity: one idea per sentence, short sentences, the main number first; (3) tone: calm, direct, no promise adjectives, no advice to buy or sell (explaining or comparing an asset is fine; a last line "This is not a recommendation to buy or sell." is added by the system, is not advice, and its presence or absence never changes the score), no exclamation, no emoji, never talks about itself; (4) language: the summary is in the expected language.',
    'Scores: 5 = flawless; 4 = good, one small flaw; 3 = usable but with a clear flaw; 2 = misleading or hard to read; 1 = wrong numbers, advice or wrong language.',
    'Answer only with JSON {"score": <1 to 5>, "reason": "<one short sentence>"}.'
].join('\n');

const DOCUMENT_RUBRIC: string = [
    'You grade a short summary of a public document from a securities issuer, written for someone who holds the asset, against the text of that document.',
    'Criteria: (1) fidelity: every fact and number comes from the document and means what the document says, nothing invented; (2) no advice: no buy, sell or hold suggestion, no "worth it", no prediction; a forecast or target of the issuer is reported as the issuer\'s own ("the company expects"), never as a promise of the summary, and an analyst recommendation quoted in the document is not repeated as advice; (3) clarity: the fact comes first, short direct sentences; (4) language: the summary is in the expected language, even when the document is in another one. A notice line about investments is added by the system and never changes the score.',
    'Scores: 5 = flawless; 4 = good, one small flaw; 3 = usable but with a clear flaw; 2 = misleading or hard to read; 1 = invented numbers, advice, a forecast presented as a promise or wrong language.',
    'Answer only with JSON {"score": <1 to 5>, "reason": "<one short sentence>"}.'
].join('\n');

function verdictOf(text: string, costUsd: number): JudgeVerdict {
    const parsed: unknown = parseJsonObject(text);
    const record: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const score: unknown = record['score'];
    if (typeof score !== 'number' || !Number.isFinite(score)) {
        return { score: MIN_SCORE, reason: 'the judge did not return a score', costUsd };
    }
    const reason: unknown = record['reason'];
    return { score: Math.min(MAX_SCORE, Math.max(MIN_SCORE, score)), reason: typeof reason === 'string' ? reason : '', costUsd };
}

async function evidenceFor(item: EvalCase): Promise<string> {
    if (isAskCase(item)) {
        return `Question from the person: ${item.question}\nData the tools can return: ${await evidenceOf(item)}`;
    }
    if (isDocumentCase(item)) {
        return `Issuer: ${item.document.issuer}\nCategory: ${item.document.category}\nDocument text:\n${item.document.text}`;
    }
    return `${serializeContext(item.context)}\nThe system replaces each marker [[kind:key]] with the name: ${JSON.stringify(item.labels)}`;
}

export async function judge(engine: Engine, spec: LlmTaskSpec, item: EvalCase, rendered: readonly string[]): Promise<JudgeVerdict> {
    engine.assertBudget();
    engine.mock()?.enqueue(MOCK_VERDICT);
    const evidence: string = await evidenceFor(item);
    const result: LlmDriverResult = await engine.driver.generate({
        credentials: engine.credentials,
        spec: { ...spec, temperature: 0, reasoning: 'minimal', maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS },
        request: {
            task: 'eval_judge',
            system: isDocumentCase(item) ? DOCUMENT_RUBRIC : RUBRIC,
            messages: [
                {
                    role: 'user',
                    content: `Expected language: ${item.locale}\nData:\n${evidence}\nReference text:\n${item.reference.join(' ')}\nText to grade:\n${rendered.join(' ')}`
                }
            ]
        }
    });
    engine.spentUsd += costOf(result);
    return verdictOf(result.text, costOf(result));
}
