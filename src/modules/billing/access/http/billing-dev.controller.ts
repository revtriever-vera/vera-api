import { Controller, Get, Param, Post, Query, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BillingDevApplication } from '../../application/billing-dev.application';
import { BillingDevPageNotFoundError } from '../../domain/billing-engine.errors';
import { FakeAdvanceAction } from '../../drivers/fake-billing-engine.driver';

const ADVANCE_ACTIONS: readonly FakeAdvanceAction[] = ['next_invoice', 'overdue', 'trial_end'];

export interface RedirectTarget {
    readonly url: string;
}

@ApiExcludeController()
@Controller('billing/_dev')
export class BillingDevController {
    public constructor(private readonly application: BillingDevApplication) {}

    @Get('capture/:token')
    @Redirect()
    public async capture(@Param('token') token: string, @Query('last4') last4?: string): Promise<RedirectTarget> {
        return { url: await this.application.saveTestCard(token, last4) };
    }

    @Post('advance/:subscriptionId/:action')
    public async advance(@Param('subscriptionId') subscriptionId: string, @Param('action') action: string): Promise<{ advanced: true }> {
        const known: FakeAdvanceAction | undefined = ADVANCE_ACTIONS.find((candidate: FakeAdvanceAction): boolean => candidate === action);
        if (known === undefined) {
            throw new BillingDevPageNotFoundError();
        }
        await this.application.advance(subscriptionId, known);
        return { advanced: true };
    }

    @Get('pay/:invoiceId')
    public async pay(@Param('invoiceId') invoiceId: string): Promise<{ paid: true }> {
        await this.application.payInvoice(invoiceId);
        return { paid: true };
    }
}
