import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { SignupLinksRepository } from './signup-links.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [SignupLinksRepository],
    exports: [SignupLinksRepository]
})
export class SignupLinksRepositoryModule {}
