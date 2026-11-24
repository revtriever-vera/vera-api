import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { AppError } from '../../../shared/errors/app.error';
import type { PlatformTokenCaller } from '../../identity/services/platform-token.service';
import { PlatformAuditRecorderService } from '../../identity/services/platform-audit-recorder.service';
import { McpToolDefinition } from '../services/mcp-tool';
import { redactArguments } from '../services/mcp-redaction';
import { PlatformReadToolsService } from '../services/platform-read-tools.service';
import { PlatformWriteToolsService } from '../services/platform-write-tools.service';

const SERVER_NAME: string = 'vera-platform';
const SERVER_VERSION: string = '1.0.0';
const UNEXPECTED: string = 'platform_mcp.unexpected_error';
const INVALID_ARGUMENTS: string = 'platform_mcp.invalid_arguments';

function errorCodeOf(error: unknown): string {
    if (error instanceof AppError) {
        return error.code;
    }
    return error instanceof ZodError ? INVALID_ARGUMENTS : UNEXPECTED;
}

function descriptorOf(tool: McpToolDefinition): Tool {
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: { ...tool.inputSchema, type: 'object' },
        annotations: tool.annotations
    };
}

@Injectable()
export class PlatformMcpApplication {
    public constructor(
        private readonly reads: PlatformReadToolsService,
        private readonly writes: PlatformWriteToolsService,
        private readonly audit: PlatformAuditRecorderService,
        private readonly context: AppContext
    ) {}

    public async runAs<T>(caller: PlatformTokenCaller, fn: () => Promise<T>): Promise<T> {
        return this.context.run(
            { ...this.context.get(), userId: caller.userId, companyId: caller.companyId, platform: true, platformTokenId: caller.tokenId },
            fn
        );
    }

    public createServer(): McpServer {
        const tools: Map<string, McpToolDefinition> = new Map(
            [...this.reads.definitions(), ...this.writes.definitions()].map((tool: McpToolDefinition) => [tool.name, tool])
        );
        const server: McpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
        server.server.registerCapabilities({ tools: {} });
        server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...tools.values()].map(descriptorOf) }));
        server.server.setRequestHandler(CallToolRequestSchema, async (request) =>
            this.call(tools, request.params.name, request.params.arguments)
        );
        return server;
    }

    private async call(tools: ReadonlyMap<string, McpToolDefinition>, name: string, args: unknown): Promise<CallToolResult> {
        const tool: McpToolDefinition | undefined = tools.get(name);
        if (tool === undefined) {
            throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
        }
        try {
            const result: unknown = await tool.run(args ?? {});
            await this.record(name, args, 'ok');
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error) {
            const code: string = errorCodeOf(error);
            await this.record(name, args, code);
            return { isError: true, content: [{ type: 'text', text: code }] };
        }
    }

    private async record(tool: string, args: unknown, outcome: string): Promise<void> {
        const context: { userId?: string; platformTokenId?: string } = this.context.get();
        await this.audit.mcpToolCalled(context.userId ?? null, {
            tokenId: context.platformTokenId ?? null,
            tool,
            arguments: redactArguments(args ?? {}),
            outcome
        });
    }
}
