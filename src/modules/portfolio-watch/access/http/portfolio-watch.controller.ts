import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { holderFilterOf } from '../../../../shared/holder/holder-filter';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PortfolioAgendaApplication } from '../../application/portfolio-agenda.application';
import { PortfolioChangesApplication } from '../../application/portfolio-changes.application';
import {
    AgendaQueryDto,
    AgendaResponse,
    ChangesQueryDto,
    ChangesResponse,
    agendaQuerySchema,
    agendaResponseSchema,
    changesQuerySchema,
    changesResponseSchema
} from '../../validation/portfolio-watch.schemas';

const AGENDA_EXAMPLE: AgendaResponse = {
    from: '2026-12-01',
    to: '2026-12-31',
    items: [
        {
            id: '0199b5b8-1c2d-7000-8000-000000000011',
            kind: 'fii_income',
            assetId: '0199b5b8-1c2d-7000-8000-000000000012',
            holdingId: null,
            name: 'XPLG11',
            date: '2026-12-01',
            exDate: '2026-12-01',
            paymentDate: '2026-12-14',
            eventDate: null,
            amountPerUnit: '0.78',
            currency: 'BRL',
            amountForAccountMinor: 7800,
            estimated: true,
            documentUrl: 'https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=100'
        },
        {
            id: '0199b5b8-1c2d-7000-8000-000000000013',
            kind: 'fixed_income_maturity',
            assetId: null,
            holdingId: '0199b5b8-1c2d-7000-8000-000000000013',
            name: 'CDB Banco X 110% CDI',
            date: '2026-12-10',
            exDate: null,
            paymentDate: null,
            eventDate: '2026-12-10',
            amountPerUnit: null,
            currency: 'BRL',
            amountForAccountMinor: 10_850_000,
            estimated: true,
            documentUrl: null
        }
    ]
};

const CHANGES_EXAMPLE: ChangesResponse = {
    days: 7,
    notice: 'Isto não é uma recomendação de compra ou venda.',
    items: [
        {
            id: '0199b5b8-1c2d-7000-8000-000000000021',
            assetId: '0199b5b8-1c2d-7000-8000-000000000012',
            symbol: 'XPLG11',
            source: 'b3_fnet',
            category: 'monthly_report',
            kind: 'management',
            date: '2026-12-03',
            summary: 'O fundo manteve a vacância física em 4% e distribuiu R$ 0,78 por cota no mês.',
            summaryAvailable: true,
            relevance: 2,
            weightBps: 800,
            weightLine: 'XPLG11 é 8% da sua carteira.',
            documentUrl: 'https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=100'
        }
    ]
};

@ApiTags('portfolio-watch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('viewer')
@Controller('portfolio-watch')
export class PortfolioWatchController {
    public constructor(
        private readonly agenda: PortfolioAgendaApplication,
        private readonly changes: PortfolioChangesApplication
    ) {}

    @Get('agenda')
    @ApiOperation({
        summary: 'Agenda of the portfolio: events of the assets held and fixed income maturities',
        description:
            'Ex-dates, payments, assemblies and earnings releases of the assets the account holds, plus the maturities of fixed income ' +
            'securities and Tesouro Direto positions, earliest first, inside the window. Each item carries the amount per unit and ' +
            'the amount for the account (current quantity x amount per unit, or the projected value at maturity), always marked ' +
            'as estimated, and the link to the notice when there is one. With `holder` the quantities and the maturities are only ' +
            'those of that holder. Available on every plan.'
    })
    @ApiZodQuery(agendaQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Agenda of the window', schema: agendaResponseSchema, example: AGENDA_EXAMPLE })
    @ApiProblemResponse({
        status: 400,
        description:
            'Invalid query (zod validation details in meta.errors) or a window that ends before it starts or spans more than 366 days',
        example: { type: 'portfolio_watch.invalid_agenda_window', title: 'InvalidAgendaWindowError', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async agendaOf(@Query() query: AgendaQueryDto): Promise<AgendaResponse> {
        return this.agenda.list({ from: query.from, to: query.to }, holderFilterOf(query.holder));
    }

    @Get('changes')
    @ApiOperation({
        summary: 'What changed in the portfolio: official documents of the assets held, summarized',
        description:
            'Documents published in the last 7 or 30 days about the assets the account holds (relevant facts, notices, results, ' +
            'monthly reports). Each item carries the summary made once per document, its kind and relevance, the share of the asset ' +
            'in the portfolio (written by the code, no model per account), the link and the source. The most relevant for the ' +
            'portfolio come first, then the newest. A document without summary (over the daily budget, scanned, too large) shows ' +
            'only its title link and "Resumo indisponível". With `classId` only assets of that class; with `holder` only what is ' +
            'theirs. Premium: other plans get `plan.feature_locked` with the count of documents and no content.'
    })
    @ApiZodQuery(changesQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Documents of the window', schema: changesResponseSchema, example: CHANGES_EXAMPLE })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid query (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 402,
        description: 'The account is not on Premium; meta.documentCount is how many documents the window has',
        example: {
            type: 'plan.feature_locked',
            title: 'FeatureLockedError',
            status: 402,
            meta: { feature: 'portfolio_changes', documentCount: 4 }
        }
    })
    public async changesOf(@Query() query: ChangesQueryDto): Promise<ChangesResponse> {
        return this.changes.list({ days: query.days, classId: query.classId ?? null, holder: holderFilterOf(query.holder) });
    }
}
