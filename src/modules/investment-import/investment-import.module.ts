import { Module } from '@nestjs/common';
import { InvestmentImportCommandModule } from './access/commands/investment-import-command.module';
import { InvestmentImportHttpModule } from './access/http/investment-import-http.module';

@Module({
    imports: [InvestmentImportHttpModule, InvestmentImportCommandModule]
})
export class InvestmentImportModule {}
