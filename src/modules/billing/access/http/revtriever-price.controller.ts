import { Controller, HttpCode, HttpStatus, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { InvoicesApplication, PriceAnswer } from '../../application/invoices.application';
import { InvalidPriceRequestError } from '../../domain/billing-engine.errors';
import { signatureOf } from './revtriever-webhook.controller';

const PRICE_REQUESTS_PER_MINUTE: number = 600;
const ONE_MINUTE_SECONDS: number = 60;

@ApiExcludeController()
@Controller('billing/revtriever')
export class RevtrieverPriceController {
    public constructor(private readonly application: InvoicesApplication) {}

    @Post('price')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'billing-price',
        limit: PRICE_REQUESTS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.ip
    })
    public async price(@Req() request: RawBodyRequest<Request>): Promise<PriceAnswer> {
        if (request.rawBody === undefined) {
            throw new InvalidPriceRequestError();
        }
        return this.application.price(request.rawBody.toString('utf8'), signatureOf(request));
    }
}
