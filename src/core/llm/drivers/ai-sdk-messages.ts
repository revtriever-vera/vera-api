import { jsonSchema, tool } from 'ai';
import type { FinishReason, LanguageModelUsage, ModelMessage, ToolSet } from 'ai';
import { JsonValue, LlmContentBlock, LlmMessage, LlmStopReason, LlmToolDefinition, LlmToolResultBlock, LlmUsage } from '../llm.types';

type AssistantPart = Extract<
    Exclude<Extract<ModelMessage, { role: 'assistant' }>['content'], string>[number],
    { type: 'text' | 'tool-call' }
>;
type ToolPart = Extract<Extract<ModelMessage, { role: 'tool' }>['content'][number], { type: 'tool-result' }>;
type UserPart =
    | { type: 'text'; text: string }
    | { type: 'image'; image: Uint8Array; mediaType: string }
    | { type: 'file'; data: Uint8Array; mediaType: string };

function blocksOf(message: LlmMessage): readonly LlmContentBlock[] {
    return typeof message.content === 'string' ? [] : message.content;
}

function toolNamesOf(messages: readonly LlmMessage[]): ReadonlyMap<string, string> {
    const names: Map<string, string> = new Map();
    for (const block of messages.flatMap(blocksOf)) {
        if (block.kind === 'tool_use') {
            names.set(block.toolUseId, block.name);
        }
    }
    return names;
}

function assistantPartsOf(block: LlmContentBlock): AssistantPart[] {
    if (block.kind === 'text') {
        return [{ type: 'text', text: block.text }];
    }
    if (block.kind === 'tool_use') {
        return [{ type: 'tool-call', toolCallId: block.toolUseId, toolName: block.name, input: block.input }];
    }
    return [];
}

function toolPartOf(block: LlmToolResultBlock, names: ReadonlyMap<string, string>): ToolPart {
    return {
        type: 'tool-result',
        toolCallId: block.toolUseId,
        toolName: names.get(block.toolUseId) ?? block.toolUseId,
        output: block.isError ? { type: 'error-text', value: block.content } : { type: 'text', value: block.content }
    };
}

function userPartsOf(block: LlmContentBlock): UserPart[] {
    if (block.kind === 'text') {
        return [{ type: 'text', text: block.text }];
    }
    if (block.kind === 'image') {
        return [{ type: 'image', image: block.data, mediaType: block.mediaType }];
    }
    return block.kind === 'file' ? [{ type: 'file', data: block.data, mediaType: block.mediaType }] : [];
}

function userMessagesOf(blocks: readonly LlmContentBlock[], names: ReadonlyMap<string, string>): ModelMessage[] {
    const results: ToolPart[] = blocks
        .filter((block: LlmContentBlock): block is LlmToolResultBlock => block.kind === 'tool_result')
        .map((block: LlmToolResultBlock): ToolPart => toolPartOf(block, names));
    const parts: UserPart[] = blocks.flatMap(userPartsOf);
    const tools: ModelMessage[] = results.length > 0 ? [{ role: 'tool', content: results }] : [];
    const said: ModelMessage[] = parts.length > 0 ? [{ role: 'user', content: parts }] : [];
    return [...tools, ...said];
}

function modelMessagesOf(message: LlmMessage, names: ReadonlyMap<string, string>): ModelMessage[] {
    if (typeof message.content === 'string') {
        return [{ role: message.role, content: message.content }];
    }
    if (message.role === 'assistant') {
        const parts: AssistantPart[] = message.content.flatMap(assistantPartsOf);
        return parts.length > 0 ? [{ role: 'assistant', content: parts }] : [];
    }
    return userMessagesOf(message.content, names);
}

export function aiSdkMessagesOf(messages: readonly LlmMessage[]): ModelMessage[] {
    const names: ReadonlyMap<string, string> = toolNamesOf(messages);
    return messages.flatMap((message: LlmMessage): ModelMessage[] => modelMessagesOf(message, names));
}

export function aiSdkToolsOf(tools: readonly LlmToolDefinition[]): ToolSet {
    return Object.fromEntries(
        tools.map((definition: LlmToolDefinition): [string, ToolSet[string]] => [
            definition.name,
            tool({ description: definition.description, inputSchema: jsonSchema(definition.inputSchema) })
        ])
    );
}

function tokens(count: number | undefined): number {
    return count ?? 0;
}

export function aiSdkUsageOf(usage: LanguageModelUsage): LlmUsage {
    const cacheRead: number = tokens(usage.inputTokenDetails.cacheReadTokens);
    return {
        inputTokens: usage.inputTokenDetails.noCacheTokens ?? Math.max(0, tokens(usage.inputTokens) - cacheRead),
        outputTokens: tokens(usage.outputTokens),
        cacheReadTokens: cacheRead
    };
}

export function aiSdkStopReasonOf(finishReason: FinishReason, calledTools: boolean): LlmStopReason {
    if (calledTools) {
        return 'tool_use';
    }
    return finishReason === 'length' ? 'max_tokens' : 'end';
}

export function aiSdkToolInputOf(input: unknown): JsonValue {
    return input === undefined ? null : (input as JsonValue);
}
