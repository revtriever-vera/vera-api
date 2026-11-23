import { Module } from '@nestjs/common';
import { NoticesHttpModule } from './access/http/notices-http.module';

@Module({
    imports: [NoticesHttpModule]
})
export class NoticesModule {}
