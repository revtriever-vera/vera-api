import { Module } from '@nestjs/common';
import { SpendingCategoriesHttpModule } from './access/http/spending-categories-http.module';

@Module({
    imports: [SpendingCategoriesHttpModule]
})
export class SpendingCategoriesModule {}
