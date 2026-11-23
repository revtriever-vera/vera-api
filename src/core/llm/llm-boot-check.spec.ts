import { describe, expect, it } from 'vitest';
import { LlmBootCheck } from './llm-boot-check';
import { LlmConfig } from './config/llm.config';
import { NoopLlmUsageAdapter } from './ports/noop-llm-usage.adapter';

function check(env: 'local' | 'dev' | 'prod', mode: 'hosted' | 'self_hosted', port: NoopLlmUsageAdapter | null): LlmBootCheck {
    return new LlmBootCheck({ DEPLOY_ENV: env, DEPLOYMENT_MODE: mode } as LlmConfig, port);
}

describe('LlmBootCheck', () => {
    it('prod hospedado sem a porta de cota falha o boot', () => {
        expect(() => {
            check('prod', 'hosted', null).onModuleInit();
        }).toThrow('LlmUsagePort ausente');
    });

    it('prod hospedado com a porta sobe, e os outros cenários sobem sem ela', () => {
        expect(() => {
            check('prod', 'hosted', new NoopLlmUsageAdapter()).onModuleInit();
        }).not.toThrow();
        expect(() => {
            check('dev', 'hosted', null).onModuleInit();
        }).not.toThrow();
        expect(() => {
            check('prod', 'self_hosted', null).onModuleInit();
        }).not.toThrow();
    });
});
