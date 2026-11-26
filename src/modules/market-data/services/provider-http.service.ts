import { Injectable } from '@nestjs/common';
import { requestBytes, requestJson } from '../drivers/provider-http';

export interface JsonRequest {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
}

export interface BytesRequest extends JsonRequest {
    readonly maxBytes: number;
}

@Injectable()
export class ProviderHttpService {
    public async getJson(request: JsonRequest): Promise<unknown> {
        return requestJson(request.url, request.headers, request.timeoutMs);
    }

    public async getBytes(request: BytesRequest): Promise<Uint8Array> {
        return requestBytes(request.url, request.headers, request.timeoutMs, request.maxBytes);
    }
}
