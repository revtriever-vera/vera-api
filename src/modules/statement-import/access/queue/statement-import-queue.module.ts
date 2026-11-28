import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { StatementImportApplicationModule } from '../../application/statement-import-application.module';
import { StatementPreviewRemoverHandler } from './preview-expiry.handler';

@Module({
    imports: [StatementImportApplicationModule, QueueModule],
    providers: [StatementPreviewRemoverHandler]
})
export class StatementImportQueueModule {}
