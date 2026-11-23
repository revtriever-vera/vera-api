import { Module } from '@nestjs/common';
import { SignupLinksHttpModule } from './access/http/signup-links-http.module';

@Module({
    imports: [SignupLinksHttpModule]
})
export class SignupLinksModule {}
