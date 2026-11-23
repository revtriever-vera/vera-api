import { Controller, Get, Param, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BillingDevApplication } from '../../application/billing-dev.application';

export interface RedirectTarget {
    readonly url: string;
}

@ApiExcludeController()
@Controller('billing/_dev')
export class BillingDevController {
    public constructor(private readonly application: BillingDevApplication) {}

    @Get('capture/:token')
    @Redirect()
    public async capture(@Param('token') token: string): Promise<RedirectTarget> {
        return { url: await this.application.saveTestCard(token) };
    }

    @Get('pay/:invoiceId')
    public async pay(@Param('invoiceId') invoiceId: string): Promise<{ paid: true }> {
        await this.application.payInvoice(invoiceId);
        return { paid: true };
    }
}
