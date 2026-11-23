import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { InvoicesApplication } from '../../application/invoices.application';
import { PaymentLink } from '../../domain/billing-engine.types';
import { InvoicePage } from '../../domain/billing.types';
import { BillingViewMapper } from '../../services/billing-view.mapper';
import {
    InvoicesPageView,
    InvoicesQueryDto,
    invoicesPageSchema,
    invoicesQuerySchema,
    paymentLinkSchema
} from '../../validation/billing-http.schemas';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing/invoices')
export class InvoicesController {
    public constructor(
        private readonly application: InvoicesApplication,
        private readonly mapper: BillingViewMapper
    ) {}

    @Get()
    @RequiresRole('viewer')
    @ApiOperation({
        summary: 'Invoice history',
        description: 'Mirror of the invoices of the signed-in company, newest first, 12 per page.'
    })
    @ApiZodQuery(invoicesQuerySchema)
    @ApiZodResponse({
        status: 200,
        description: 'One page of invoices',
        schema: invoicesPageSchema,
        example: {
            items: [
                {
                    id: '0199a1c2-7e1d-7a3b-9c11-3f0e5d8a4b21',
                    cycleStart: '2026-11-01T00:00:00.000Z',
                    cycleEnd: '2026-12-01T00:00:00.000Z',
                    totalCents: 1490,
                    method: 'pix',
                    status: 'paid',
                    dueDate: '2026-11-01T00:00:00.000Z',
                    paidAt: '2026-11-01T14:03:00.000Z'
                }
            ],
            page: 1,
            total: 1
        }
    })
    public async list(@Query() query: InvoicesQueryDto): Promise<InvoicesPageView> {
        const page: InvoicePage = await this.application.list(query.page);
        return this.mapper.invoicesPage(page);
    }

    @Get(':id/payment-link')
    @RequiresRole('viewer')
    @ApiOperation({
        summary: 'Link to pay an invoice',
        description:
            'Asks the billing provider for the payment page of an invoice of the signed-in company, at the moment of the click. ' +
            'The link is never stored or logged. For a paid invoice it answers only the gateway receipt (`kind: gateway`) when the provider has one.'
    })
    @ApiParam({ name: 'id', description: 'Invoice id from the history or from `openInvoice` of GET /billing/me' })
    @ApiZodResponse({
        status: 200,
        description: 'Page to pay the invoice',
        schema: paymentLinkSchema,
        example: { url: 'https://pay.example.com/i/abc', kind: 'payment_page' }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'The invoice does not exist for this company (billing.invoice_not_found)',
        example: { type: 'billing.invoice_not_found', title: 'InvoiceNotFoundError', status: 404 }
    })
    public async paymentLink(@Param('id') id: string): Promise<PaymentLink> {
        return this.application.paymentLink(id);
    }
}
