import { Module } from '@nestjs/common';
import { PlatformAdminHttpModule } from './access/platform-admin-http.module';

@Module({
    imports: [PlatformAdminHttpModule]
})
export class PlatformAdminModule {}
