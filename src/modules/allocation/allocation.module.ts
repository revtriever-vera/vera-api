import { Module } from '@nestjs/common';
import { AllocationHttpModule } from './access/http/allocation-http.module';

@Module({
    imports: [AllocationHttpModule]
})
export class AllocationModule {}
