import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PlatformMcpApplicationModule } from '../../application/platform-mcp-application.module';
import { McpController } from './mcp.controller';
import { PlatformTokensController } from './platform-tokens.controller';

@Module({
    imports: [PlatformMcpApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [PlatformTokensController, McpController]
})
export class PlatformMcpHttpModule {}
