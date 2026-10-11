import { Module } from '@nestjs/common';
import { SpendingCutsHttpModule } from './access/http/spending-cuts-http.module';

@Module({
    imports: [SpendingCutsHttpModule]
})
export class SpendingCutsModule {}
