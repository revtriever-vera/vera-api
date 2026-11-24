import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { PlatformMcpInvalidWindowError } from '../domain/platform-mcp.errors';
import { PlatformAuditRecorderService } from '../../identity/services/platform-audit-recorder.service';
import { defineTool, McpToolDefinition, READ_ONLY } from '../services/mcp-tool';
import { PlatformReadToolsService } from '../services/platform-read-tools.service';
import { PlatformWriteToolsService } from '../services/platform-write-tools.service';
import { PlatformMcpApplication } from './platform-mcp.application';

interface Harness {
    readonly client: Client;
    readonly audited: ReturnType<typeof vi.fn>;
}

const open: Client[] = [];

async function connect(): Promise<Harness> {
    const tools: McpToolDefinition[] = [
        defineTool({
            name: 'echo',
            description: 'Echoes the text',
            shape: { text: z.string(), token: z.string().optional() },
            annotations: READ_ONLY,
            run: async (args) => Promise.resolve({ echoed: args.text })
        }),
        defineTool({
            name: 'boom',
            description: 'Fails with a domain error',
            shape: {},
            annotations: READ_ONLY,
            run: async () => Promise.reject(new PlatformMcpInvalidWindowError())
        }),
        defineTool({
            name: 'crash',
            description: 'Fails without a code',
            shape: {},
            annotations: READ_ONLY,
            run: async () => Promise.reject(new Error('db password=hunter2 leaked'))
        })
    ];
    const audited: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const application: PlatformMcpApplication = new PlatformMcpApplication(
        { definitions: () => tools } as unknown as PlatformReadToolsService,
        { definitions: () => [] } as unknown as PlatformWriteToolsService,
        { mcpToolCalled: audited } as unknown as PlatformAuditRecorderService,
        { get: () => ({ userId: 'user-1', platformTokenId: 'token-1' }) } as unknown as AppContext
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await application.createServer().connect(serverSide);
    const client: Client = new Client({ name: 'test', version: '1' });
    await client.connect(clientSide);
    open.push(client);
    return { client, audited };
}

function textOf(result: unknown): string {
    return ((result as { content: { text: string }[] }).content[0] as { text: string }).text;
}

describe('PlatformMcpApplication', () => {
    afterEach(async () => {
        await Promise.all(open.splice(0).map(async (client: Client) => client.close()));
    });

    it('lista as ferramentas com o schema de entrada em JSON Schema', async () => {
        const { client } = await connect();

        const listed = await client.listTools();

        expect(listed.tools.map((tool) => tool.name)).toEqual(['echo', 'boom', 'crash']);
        expect(listed.tools[0]?.inputSchema).toMatchObject({
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text']
        });
        expect(listed.tools[0]?.annotations).toMatchObject({ readOnlyHint: true });
    });

    it('chama a ferramenta e audita com o token, a ferramenta e os argumentos sem segredos', async () => {
        const { client, audited } = await connect();

        const result = await client.callTool({ name: 'echo', arguments: { text: 'oi', token: 'vera_pat_x' } });

        expect(textOf(result)).toBe('{"echoed":"oi"}');
        expect(audited).toHaveBeenCalledWith('user-1', {
            tokenId: 'token-1',
            tool: 'echo',
            arguments: { text: 'oi', token: '[redacted]' },
            outcome: 'ok'
        });
    });

    it('erro de domínio volta como erro da ferramenta com o código e é auditado', async () => {
        const { client, audited } = await connect();

        const result = await client.callTool({ name: 'boom', arguments: {} });

        expect(result).toMatchObject({ isError: true });
        expect(textOf(result)).toBe('platform_mcp.invalid_window');
        expect(audited).toHaveBeenCalledWith('user-1', expect.objectContaining({ tool: 'boom', outcome: 'platform_mcp.invalid_window' }));
    });

    it('erro inesperado não vaza a mensagem', async () => {
        const { client } = await connect();

        const result = await client.callTool({ name: 'crash', arguments: {} });

        expect(textOf(result)).toBe('platform_mcp.unexpected_error');
    });

    it('argumento inválido vira erro da ferramenta e é auditado', async () => {
        const { client, audited } = await connect();

        const result = await client.callTool({ name: 'echo', arguments: { text: 1 } });

        expect(textOf(result)).toBe('platform_mcp.invalid_arguments');
        expect(audited).toHaveBeenCalledWith('user-1', expect.objectContaining({ outcome: 'platform_mcp.invalid_arguments' }));
    });

    it('ferramenta desconhecida é erro do protocolo, sem auditoria', async () => {
        const { client, audited } = await connect();

        await expect(client.callTool({ name: 'nope', arguments: {} })).rejects.toThrow(/Unknown tool/);
        expect(audited).not.toHaveBeenCalled();
    });
});
