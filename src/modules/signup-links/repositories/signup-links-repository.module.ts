import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { SignupEmailMarksRepository } from './signup-email-marks.repository';
import { SignupLinksRepository } from './signup-links.repository';
import { SignupRedemptionsRepository } from './signup-redemptions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [SignupLinksRepository, SignupRedemptionsRepository, SignupEmailMarksRepository],
    exports: [SignupLinksRepository, SignupRedemptionsRepository, SignupEmailMarksRepository]
})
export class SignupLinksRepositoryModule {}
