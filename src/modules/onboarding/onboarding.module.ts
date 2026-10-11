import { Module } from '@nestjs/common';
import { OnboardingHttpModule } from './access/onboarding-http.module';

@Module({
    imports: [OnboardingHttpModule]
})
export class OnboardingModule {}
