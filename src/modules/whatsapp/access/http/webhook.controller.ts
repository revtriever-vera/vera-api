import { Controller, Get, Header, HttpCode, HttpStatus, Post, Query, RawBodyRequest, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery } from '../../../../core/http/api-zod.decorators';
import { WebhookApplication } from '../../application/webhook.application';
import { WebhookBodyTooLargeError, WebhookContentTypeError } from '../../domain/whatsapp.errors';
import { WEBHOOK_BODY_LIMIT_BYTES } from '../../domain/whatsapp.types';
import { VerificationQueryDto, verificationQuerySchema } from '../../validation/whatsapp-webhook.schemas';

const SIGNATURE_HEADER: string = 'x-hub-signature-256';

function signatureOf(request: Request): string | null {
    const header: string | string[] | undefined = request.headers[SIGNATURE_HEADER];
    return typeof header === 'string' ? header : null;
}

@ApiTags('whatsapp')
@Controller('whatsapp/webhook')
export class WebhookController {
    public constructor(private readonly webhook: WebhookApplication) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    @ApiOperation({
        summary: 'Answer the Meta webhook verification handshake',
        description:
            'Public route called by Meta when the webhook is registered. Echoes hub.challenge as plain text when hub.mode is subscribe ' +
            'and hub.verify_token matches the one of a configured number; refuses with 403 otherwise.'
    })
    @ApiZodQuery(verificationQuerySchema)
    @ApiResponse({ status: 200, description: 'The challenge, as text/plain' })
    @ApiProblemResponse({
        status: 403,
        description: 'Wrong mode or verify token (whatsapp.webhook_verification_failed)',
        example: { type: 'whatsapp.webhook_verification_failed', title: 'WebhookVerificationFailedError', status: 403 }
    })
    public async verify(@Query() query: VerificationQueryDto, @Res({ passthrough: true }) response: Response): Promise<string> {
        const challenge: string = await this.webhook.verify(query);
        response.type('text/plain');
        return challenge;
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Receive Meta webhook events',
        description:
            'Public route called by Meta. Stores the raw body with deduplication by SHA-256 and answers 200 before validating anything; ' +
            'the X-Hub-Signature-256 header is checked later by the queue consumer with the app secret of the number, and an event ' +
            'with a wrong signature is discarded there.'
    })
    @ApiResponse({ status: 200, description: 'Stored for processing (also answered for a repeated delivery)' })
    @ApiProblemResponse({
        status: 413,
        description: 'Body larger than 3 MB (whatsapp.webhook_body_too_large)',
        example: { type: 'whatsapp.webhook_body_too_large', title: 'WebhookBodyTooLargeError', status: 413 }
    })
    @ApiProblemResponse({
        status: 415,
        description: 'Content-Type is not application/json (whatsapp.webhook_content_type)',
        example: { type: 'whatsapp.webhook_content_type', title: 'WebhookContentTypeError', status: 415 }
    })
    public async receive(@Req() request: RawBodyRequest<Request>): Promise<void> {
        if (request.is('application/json') === false || request.rawBody === undefined) {
            throw new WebhookContentTypeError();
        }
        if (request.rawBody.length > WEBHOOK_BODY_LIMIT_BYTES) {
            throw new WebhookBodyTooLargeError();
        }
        await this.webhook.receive(request.rawBody.toString('utf8'), signatureOf(request));
    }
}
