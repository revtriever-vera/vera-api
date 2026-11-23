import { Controller, HttpCode, HttpStatus, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingEventsApplication } from '../../application/billing-events.application';
import { InvalidEventError } from '../../domain/billing-engine.errors';

const SIGNATURE_HEADER: string = 'x-revtriever-signature';

export function signatureOf(request: Request): string | null {
    const header: string | string[] | undefined = request.headers[SIGNATURE_HEADER];
    return typeof header === 'string' ? header : null;
}

@ApiExcludeController()
@Controller('billing/revtriever')
export class RevtrieverWebhookController {
    public constructor(private readonly application: BillingEventsApplication) {}

    @Post('events/:token')
    @HttpCode(HttpStatus.OK)
    public async receive(@Param('token') token: string, @Req() request: RawBodyRequest<Request>): Promise<{ received: true }> {
        if (request.rawBody === undefined) {
            throw new InvalidEventError();
        }
        await this.application.receive(token, request.rawBody.toString('utf8'), signatureOf(request));
        return { received: true };
    }
}
