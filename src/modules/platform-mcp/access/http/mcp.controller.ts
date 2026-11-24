import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { All, Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { PlatformTokenGuard, platformCallerOf } from '../../../identity/services/platform-token.guard';
import { PlatformMcpApplication } from '../../application/platform-mcp.application';

const METHOD_NOT_ALLOWED: number = 405;
const JSONRPC_SERVER_ERROR: number = -32000;

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformTokenGuard)
@Controller('mcp')
export class McpController {
    public constructor(private readonly mcp: PlatformMcpApplication) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'MCP server of the platform',
        description:
            'Streamable HTTP endpoint of the Model Context Protocol, stateless: one JSON-RPC message per POST. Authenticated with a platform token ' +
            '(`Authorization: Bearer vera_pat_...`, created in `POST /platform/tokens`), not with a user session. Lists and calls tools that read ' +
            'accounts, billing and the audit trail and that manage signup links and billing reconciliation. Every tool call records `mcp.tool_called` ' +
            'in the audit trail. Rate limited per token.'
    })
    @ApiBody({ description: 'A JSON-RPC 2.0 message of the Model Context Protocol', schema: { type: 'object' } })
    @ApiResponse({ status: 200, description: 'The JSON-RPC response' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing, unknown, expired or revoked token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'The token does not belong to a person of the platform company (identity.platform_only)',
        example: { type: 'identity.platform_only', title: 'PlatformOnlyError', status: 403 }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'Self-hosted deployment (identity.platform_disabled)',
        example: { type: 'identity.platform_disabled', title: 'PlatformDisabledError', status: 404 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many calls with this token (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async handle(@Req() request: Request, @Res() response: Response, @Body() body: unknown): Promise<void> {
        await this.mcp.runAs(platformCallerOf(request), async () => this.serve(request, response, body));
    }

    @All()
    @ApiOperation({
        summary: 'MCP server of the platform: methods other than POST',
        description: 'The server is stateless: only POST is accepted.'
    })
    @ApiResponse({ status: METHOD_NOT_ALLOWED, description: 'Method not allowed' })
    public refuse(@Res() response: Response): void {
        response
            .status(METHOD_NOT_ALLOWED)
            .set('Allow', 'POST')
            .json({ jsonrpc: '2.0', error: { code: JSONRPC_SERVER_ERROR, message: 'Method not allowed.' }, id: null });
    }

    private async serve(request: Request, response: Response, body: unknown): Promise<void> {
        const server: McpServer = this.mcp.createServer();
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        });
        response.on('close', () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(request, response, body);
    }
}
