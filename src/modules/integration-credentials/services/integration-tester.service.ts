import { Injectable } from '@nestjs/common';
import { IntegrationCredentialsByKind } from '../domain/integration.types';
import { LlmTester } from './testers/llm.tester';
import { WhatsAppTester } from './testers/whatsapp.tester';

@Injectable()
export class IntegrationTesterService {
    public constructor(
        private readonly llmTester: LlmTester,
        private readonly whatsAppTester: WhatsAppTester
    ) {}

    public async llm(credentials: IntegrationCredentialsByKind['llm']): Promise<void> {
        await this.llmTester.test(credentials);
    }

    public async whatsApp(credentials: IntegrationCredentialsByKind['whatsapp']): Promise<void> {
        await this.whatsAppTester.test(credentials);
    }
}
