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
        this.assertVisionPriced();
    }

    private assertVisionPriced(): void {
        const vision: string | undefined = this.config.LLM_VISION_MODEL;
        const hostedWithKey: boolean = this.config.DEPLOYMENT_MODE === 'hosted' && this.config.AI_GATEWAY_API_KEY.length > 0;
        if (hostedWithKey && vision !== undefined && this.config.LLM_PRICE_TABLE[vision] === undefined) {
            throw new Error(`LLM_PRICE_TABLE não tem preço para o modelo de visão ${vision}`);
        }
    }
}
