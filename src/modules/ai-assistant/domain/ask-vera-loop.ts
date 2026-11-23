import {
    JsonObject,
    JsonValue,
    LlmContentBlock,
    LlmGenerationRequest,
    LlmGenerationResponse,
    LlmMessage,
    LlmToolDefinition,
    LlmToolUse
} from '../../../core/llm/llm.types';
import { toolInputSchemaOf } from '../../../core/llm/tool-input-schema';
import { AppLocale } from '../../../shared/i18n/locale';
import { figuresIn } from './summary-guard';
import { LabelSource } from './context/ai-context.types';
import { AnswerCheck, AnswerFacts, AnswerVerdict } from './ask-answer-guard';
import {
    ASK_VERA_MAX_TOOL_BYTES,
    ASK_VERA_FEATURE,
    ASK_VERA_TASK,
    ASK_VERA_TOOL_KINDS,
    AskVeraProposal,
    AskVeraTool,
    AskVeraToolOutput,
    AskVeraTurn,
    ASK_VERA_MAX_HISTORY
} from './ask-vera.types';

export interface AskLoopInput {
    readonly system: string;
    readonly messages: readonly LlmMessage[];
    readonly tools: readonly AskVeraTool[];
    readonly locale: AppLocale;
    readonly messageId: string;
    readonly maxSteps: number;
    readonly generate: (request: LlmGenerationRequest) => Promise<LlmGenerationResponse>;
    readonly check: (text: string, facts: AnswerFacts) => AnswerVerdict;
    readonly onToolFailure: (name: string) => void;
    readonly onCheckFailure: (check: AnswerCheck) => void;
}

export type AskLoopEnding = 'answered' | 'direct' | 'truncated' | 'check_failed';

export interface AskLoopResult {
    readonly ending: AskLoopEnding;
    readonly text: string;
    readonly steps: number;
    readonly toolsUsed: readonly string[];
    readonly proposals: readonly AskVeraProposal[];
    readonly costMicros: number;
}

interface Run {
    readonly toolsUsed: string[];
    readonly proposals: AskVeraProposal[];
    readonly numbers: Set<number>;
    readonly keys: Map<string, LabelSource>;
    readonly ambiguous: Set<string>;
    costMicros: number;
    checkFailures: number;
}

interface ToolOutcome {
    readonly block: LlmContentBlock;
    readonly direct: string | null;
}

export function messagesOf(history: readonly AskVeraTurn[], text: string): readonly LlmMessage[] {
    const turns: AskVeraTurn[] = [...history.slice(-ASK_VERA_MAX_HISTORY), { role: 'person', text }];
    const merged: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const turn of turns) {
        const role: 'user' | 'assistant' = turn.role === 'person' ? 'user' : 'assistant';
        const last: { role: 'user' | 'assistant'; content: string } | undefined = merged.at(-1);
        if (last?.role === role) {
            last.content = `${last.content}\n${turn.text}`;
            continue;
        }
        if (last === undefined && role === 'assistant') {
            continue;
        }
        merged.push({ role, content: turn.text });
    }
    return merged;
}

function definitionsOf(tools: readonly AskVeraTool[], locale: AppLocale): readonly LlmToolDefinition[] {
    return tools.map((tool: AskVeraTool): LlmToolDefinition => ({
        name: tool.name,
        description: tool.description(locale),
        inputSchema: toolInputSchemaOf(tool.inputSchema)
    }));
}

function leavesIn(value: JsonValue): JsonValue[] {
    if (Array.isArray(value)) {
        return value.flatMap(leavesIn);
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap(leavesIn);
    }
    return [value];
}

function numbersOf(output: AskVeraToolOutput, locale: AppLocale): readonly number[] {
    if (output.numbers !== undefined) {
        return output.numbers;
    }
    return leavesIn(output.payload).flatMap((leaf: JsonValue): number[] => {
        if (typeof leaf === 'number') {
            return [Math.abs(Math.round(leaf))];
        }
        return typeof leaf === 'string' ? figuresIn(leaf, locale).map((figure): number => Math.round(figure.value)) : [];
    });
}

function absorb(run: Run, output: AskVeraToolOutput, locale: AppLocale): void {
    for (const value of numbersOf(output, locale)) {
        run.numbers.add(value);
    }
    for (const [key, source] of output.keys ?? []) {
        const known: LabelSource | undefined = run.keys.get(key);
        if (known !== undefined && known.name !== source.name) {
            run.ambiguous.add(key);
        }
        run.keys.set(key, source);
    }
}

function factsOf(run: Run): AnswerFacts {
    const keys: Map<string, LabelSource> = new Map(run.keys);
    for (const key of run.ambiguous) {
        keys.delete(key);
    }
    return { numbers: [...run.numbers].sort((left: number, right: number): number => left - right), keys };
}

function errorBlock(use: LlmToolUse, detail: string): ToolOutcome {
    return {
        block: { kind: 'tool_result', toolUseId: use.toolUseId, content: JSON.stringify({ error: detail }), isError: true },
        direct: null
    };
}

function resultBlock(use: LlmToolUse, payload: JsonObject): ToolOutcome {
    const content: string = JSON.stringify(payload);
    if (Buffer.byteLength(content) > ASK_VERA_MAX_TOOL_BYTES) {
        return errorBlock(use, 'the result is too large; ask for a narrower period or category');
    }
    return { block: { kind: 'tool_result', toolUseId: use.toolUseId, content, isError: false }, direct: null };
}

async function executeTool(use: LlmToolUse, tools: readonly AskVeraTool[], run: Run, input: AskLoopInput): Promise<ToolOutcome> {
    const tool: AskVeraTool | undefined = tools.find((candidate: AskVeraTool): boolean => candidate.name === use.name);
    if (tool === undefined) {
        input.onToolFailure('unknown');
        return errorBlock(use, `there is no tool named "${use.name}"`);
    }
    const parsed: ReturnType<typeof tool.inputSchema.safeParse> = tool.inputSchema.safeParse(use.input);
    if (!parsed.success) {
        input.onToolFailure(tool.name);
        return errorBlock(use, `invalid input: ${parsed.error.issues[0]?.message ?? 'wrong shape'}`);
    }
    try {
        const output: AskVeraToolOutput = await tool.run(parsed.data);
        return outcomeOf(use, tool, output, run, input.locale);
    } catch {
        input.onToolFailure(tool.name);
        return errorBlock(use, 'the tool failed; answer without it or say you could not check');
    }
}

function outcomeOf(use: LlmToolUse, tool: AskVeraTool, output: AskVeraToolOutput, run: Run, locale: AppLocale): ToolOutcome {
    run.toolsUsed.push(tool.name);
    if (tool.kind === ASK_VERA_TOOL_KINDS.direct) {
        return { block: { kind: 'tool_result', toolUseId: use.toolUseId, content: '{}', isError: false }, direct: output.text ?? '' };
    }
    if (tool.kind === ASK_VERA_TOOL_KINDS.proposal && output.proposal !== undefined) {
        run.proposals.push({ tool: tool.name, summary: output.proposal.summary, payload: output.proposal.payload });
        return resultBlock(use, { status: 'proposed', note: 'tell the person this is waiting for their confirmation' });
    }
    absorb(run, output, locale);
    return resultBlock(use, output.payload);
}

async function runTools(uses: readonly LlmToolUse[], run: Run, input: AskLoopInput): Promise<Executed> {
    const blocks: LlmContentBlock[] = [];
    for (const use of uses) {
        const outcome: ToolOutcome = await executeTool(use, input.tools, run, input);
        if (outcome.direct !== null) {
            return { blocks, direct: outcome.direct };
        }
        blocks.push(outcome.block);
    }
    return { blocks, direct: null };
}

function assistantTurn(response: LlmGenerationResponse): LlmMessage {
    const blocks: LlmContentBlock[] = response.text === '' ? [] : [{ kind: 'text', text: response.text }];
    return {
        role: 'assistant',
        content: [...blocks, ...response.toolUses.map((use: LlmToolUse): LlmContentBlock => ({ kind: 'tool_use', ...use }))]
    };
}

function correctionOf(text: string, verdict: Extract<AnswerVerdict, { ok: false }>): readonly LlmMessage[] {
    return [
        { role: 'assistant', content: text === '' ? '(empty)' : text },
        {
            role: 'user',
            content: `That answer failed the check "${verdict.check}": ${verdict.detail}. Write the answer again, fixing that.`
        }
    ];
}

interface Executed {
    readonly blocks: LlmContentBlock[];
    readonly direct: string | null;
}

class AskVeraLoop {
    private readonly run: Run = {
        toolsUsed: [],
        proposals: [],
        numbers: new Set<number>(),
        keys: new Map<string, LabelSource>(),
        ambiguous: new Set<string>(),
        costMicros: 0,
        checkFailures: 0
    };
    private readonly definitions: readonly LlmToolDefinition[];
    private messages: readonly LlmMessage[];

    public constructor(private readonly input: AskLoopInput) {
        this.definitions = definitionsOf(input.tools, input.locale);
        this.messages = input.messages;
    }

    public async execute(): Promise<AskLoopResult> {
        for (let step: number = 1; step <= this.input.maxSteps; step += 1) {
            const ended: AskLoopResult | null = await this.step(step);
            if (ended !== null) {
                return ended;
            }
        }
        return this.result('truncated', '', this.input.maxSteps);
    }

    private async step(step: number): Promise<AskLoopResult | null> {
        const response: LlmGenerationResponse = await this.input.generate({
            task: ASK_VERA_TASK,
            feature: ASK_VERA_FEATURE,
            system: this.input.system,
            messages: this.messages,
            tools: this.definitions,
            referenceId: `ask:${this.input.messageId}:${String(step)}`
        });
        this.run.costMicros += response.costMicros;
        return response.toolUses.length > 0 ? this.useTools(response, step) : this.answer(response, step);
    }

    private async useTools(response: LlmGenerationResponse, step: number): Promise<AskLoopResult | null> {
        const executed: Executed = await runTools(response.toolUses, this.run, this.input);
        if (executed.direct !== null) {
            return this.result('direct', executed.direct, step);
        }
        this.messages = [...this.messages, assistantTurn(response), { role: 'user', content: executed.blocks }];
        return null;
    }

    private answer(response: LlmGenerationResponse, step: number): AskLoopResult | null {
        const verdict: AnswerVerdict = this.input.check(response.text, factsOf(this.run));
        if (verdict.ok) {
            return this.result('answered', verdict.text, step);
        }
        this.input.onCheckFailure(verdict.check);
        this.run.checkFailures += 1;
        if (this.run.checkFailures > 1) {
            return this.result('check_failed', '', step);
        }
        this.messages = [...this.messages, ...correctionOf(response.text, verdict)];
        return null;
    }

    private result(ending: AskLoopEnding, text: string, steps: number): AskLoopResult {
        return { ending, text, steps, toolsUsed: this.run.toolsUsed, proposals: this.run.proposals, costMicros: this.run.costMicros };
    }
}

export async function runAskLoop(input: AskLoopInput): Promise<AskLoopResult> {
    return new AskVeraLoop(input).execute();
}
