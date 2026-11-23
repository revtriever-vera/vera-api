import { Module } from '@nestjs/common';
import { GoalsHttpModule } from './access/http/goals-http.module';

@Module({
    imports: [GoalsHttpModule]
})
export class GoalsModule {}
