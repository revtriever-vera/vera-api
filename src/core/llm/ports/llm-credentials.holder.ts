import { Injectable } from '@nestjs/common';
import { LlmCredentials } from '../llm.types';
import { ConfigLlmCredentialsAdapter } from './config-llm-credentials.adapter';
import { LlmCredentialsPort } from './llm-credentials.port';

@Injectable()
export class LlmCredentialsHolder extends LlmCredentialsPort {
    private port: LlmCredentialsPort | null = null;

    public constructor(private readonly fallback: ConfigLlmCredentialsAdapter) {
        super();
    }

    public register(port: LlmCredentialsPort): void {
        this.port = port;
    }

    public async resolve(): Promise<LlmCredentials | null> {
        return (this.port ?? this.fallback).resolve();
    }
}
