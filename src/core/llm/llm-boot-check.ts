import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { llmConfig } from './config/llm.config';
import { LlmUsagePort } from './ports/llm-usage.port';

@Injectable()
export class LlmBootCheck implements OnModuleInit {
    public constructor(
        @Inject(llmConfig.KEY) private readonly config: ConfigType<typeof llmConfig>,
        @Optional() @Inject(LlmUsagePort) private readonly usage: LlmUsagePort | null
    ) {}

    public onModuleInit(): void {
        const hostedProduction: boolean = this.config.DEPLOY_ENV === 'prod' && this.config.DEPLOYMENT_MODE === 'hosted';
        if (hostedProduction && this.usage === null) {
            throw new Error('LlmUsagePort ausente em produção hospedada: o custo do modelo ficaria sem teto');
        }
    }
}
