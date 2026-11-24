import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodRawShape } from 'zod';
import { inputSchemaOf } from './mcp-schema';

export interface McpToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
    readonly annotations: ToolAnnotations;
    readonly run: (args: unknown) => Promise<unknown>;
}

export interface McpToolSpec<S extends ZodRawShape> {
    readonly name: string;
    readonly description: string;
    readonly shape: S;
    readonly annotations: ToolAnnotations;
    readonly run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

export function defineTool<S extends ZodRawShape>(spec: McpToolSpec<S>): McpToolDefinition {
    const schema: z.ZodObject<S> = z.object(spec.shape);
    return {
        name: spec.name,
        description: spec.description,
        inputSchema: inputSchemaOf(schema),
        annotations: spec.annotations,
        run: async (args: unknown): Promise<unknown> => spec.run(schema.parse(args))
    };
}

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
