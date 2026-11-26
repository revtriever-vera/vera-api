import {
    JsonObject,
    LlmFeature,
    LlmTask,
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
import { assetKeysIn } from './forbidden-terms';
import {
    ASK_VERA_MAX_TOOL_BYTES,
    ASK_VERA_TOOL_KINDS,
    AskVeraProposal,
    AskVeraSent,
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
    readonly task: LlmTask;
    readonly feature: LlmFeature;
    readonly knownAssets: ReadonlySet<string>;
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
    readonly sent: readonly AskVeraSent[];
    readonly costMicros: number;
}

interface Run {
    readonly toolsUsed: string[];
    readonly proposals: AskVeraProposal[];
    readonly sent: AskVeraSent[];
    readonly assets: Set<string>;
    readonly links: Set<string>;
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
    for (const leaf of leavesIn(output.payload)) {
        if (typeof leaf === 'string') {
            assetKeysIn(leaf).forEach((key: string): Set<string> => run.assets.add(key));
        }
    }
}

const ROUTE: RegExp = /^\/[\w\-/#?=&.]*$/;
const MARKDOWN_ROUTE: RegExp = /\]\((\/[^)\s]*)\)/g;

function routesIn(text: string): readonly string[] {
    const inline: string[] = [...text.matchAll(MARKDOWN_ROUTE)].map((match: RegExpMatchArray): string => match[1] ?? '');
    return ROUTE.test(text) ? [text, ...inline] : inline;
}

function keepSent(run: Run, tool: string, payload: JsonObject): void {
    run.sent.push({ tool, payload });
    for (const leaf of leavesIn(payload)) {
        if (typeof leaf !== 'string') {
            continue;
        }
        assetKeysIn(leaf).forEach((key: string): Set<string> => run.assets.add(key));
        routesIn(leaf).forEach((route: string): Set<string> => run.links.add(route));
    }
}

function factsOf(run: Run): AnswerFacts {
    const keys: Map<string, LabelSource> = new Map(run.keys);
    for (const key of run.ambiguous) {
        keys.delete(key);
    }
    return {
        numbers: [...run.numbers].sort((left: number, right: number): number => left - right),
        keys,
        assets: run.assets,
        links: run.links
    };
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
    const outcome: ToolOutcome = resultBlock(use, output.payload);
    if (outcome.block.kind === 'tool_result' && !outcome.block.isError) {
        keepSent(run, tool.name, output.payload);
    }
    return outcome;
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

const ACTION_CLAIMS: readonly RegExp[] = [
    /confirma?\s*\?/i,
    /(?:lembrete|reuni[aã]o|evento|compromisso)[^.!?\n]{0,60}\b(?:criad|marcad|agendad)[oa]\b/i,
    /\b(?:created|scheduled|booked|criei|marquei|agendei)\b/i
];

/** Texto do modelo que afirma uma ação pendente (ou pede o "sim") sem a ferramenta de proposta ter rodado. */
function claimsUnproposedAction(text: string, run: Run, tools: readonly AskVeraTool[]): boolean {
    const proposers: Set<string> = new Set(
        tools
            .filter((tool: AskVeraTool): boolean => tool.kind === ASK_VERA_TOOL_KINDS.proposal)
            .map((tool: AskVeraTool): string => tool.name)
    );
    const called: boolean = run.toolsUsed.some((name: string): boolean => proposers.has(name));
    return proposers.size > 0 && !called && ACTION_CLAIMS.some((claim: RegExp): boolean => claim.test(text));
}

interface Executed {
    readonly blocks: LlmContentBlock[];
    readonly direct: string | null;
}

function runOf(input: AskLoopInput): Run {
    return {
        toolsUsed: [],
        proposals: [],
        sent: [],
        assets: new Set<string>(input.knownAssets),
        links: new Set<string>(),
        numbers: new Set<number>(),
        keys: new Map<string, LabelSource>(),
        ambiguous: new Set<string>(),
        costMicros: 0,
        checkFailures: 0
    };
}

class AskVeraLoop {
    private readonly run: Run;
    private readonly definitions: readonly LlmToolDefinition[];
    private messages: readonly LlmMessage[];

    public constructor(private readonly input: AskLoopInput) {
        this.run = runOf(input);
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
            task: this.input.task,
            feature: this.input.feature,
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

    /** Com proposta, o resumo chega com os botões: o texto do modelo só repetiria (e arriscaria) o que ele diz. */
    private answer(response: LlmGenerationResponse, step: number): AskLoopResult | null {
        if (this.run.proposals.length > 0) {
            return this.result('answered', '', step);
        }
        const verdict: AnswerVerdict = claimsUnproposedAction(response.text, this.run, this.input.tools)
            ? {
                  ok: false,
                  check: 'unproposed',
                  detail: 'you wrote that something is created or asked for confirmation without calling the tool; call the tool, the system sends the confirmation buttons'
              }
            : this.input.check(response.text, factsOf(this.run));
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
        return {
            ending,
            text,
            steps,
            toolsUsed: this.run.toolsUsed,
            proposals: this.run.proposals,
            sent: this.run.sent,
            costMicros: this.run.costMicros
        };
    }
}

export async function runAskLoop(input: AskLoopInput): Promise<AskLoopResult> {
    return new AskVeraLoop(input).execute();
}
