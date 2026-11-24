import { Module } from '@nestjs/common';
import { PlatformMcpHttpModule } from './access/http/platform-mcp-http.module';

@Module({
    imports: [PlatformMcpHttpModule]
})
export class PlatformMcpModule {}
