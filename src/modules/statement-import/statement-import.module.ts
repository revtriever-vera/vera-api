import { Module } from '@nestjs/common';
import { StatementImportHttpModule } from './access/http/statement-import-http.module';

@Module({
    imports: [StatementImportHttpModule]
})
export class StatementImportModule {}
