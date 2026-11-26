import { Injectable } from '@nestjs/common';
import { requestJson } from '../drivers/provider-http';

export interface JsonRequest {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
}

@Injectable()
export class ProviderHttpService {
    public async getJson(request: JsonRequest): Promise<unknown> {
        return requestJson(request.url, request.headers, request.timeoutMs);
    }
}
