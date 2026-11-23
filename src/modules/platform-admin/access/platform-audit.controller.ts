import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { PlatformOnly } from '../../identity/services/platform-only.decorator';
import { PlatformAuditApplication } from '../application/platform-audit.application';
import { AuditListView, auditListSchema, AuditQueryDto, auditQuerySchema } from '../validation/platform-audit.schemas';

@ApiTags('platform')
@PlatformOnly()
@Controller('platform')
export class PlatformAuditController {
    public constructor(private readonly audit: PlatformAuditApplication) {}

    @Get('audit')
    @ApiOperation({
        summary: 'Platform audit trail',
        description:
            'The most recent admin events, newest first. Only people of the platform company reach it; a self-hosted deployment answers 404.'
    })
    @ApiZodQuery(auditQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Recent audit entries', schema: auditListSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'The person is not of the platform company (identity.platform_only)',
        example: { type: 'identity.platform_only', title: 'PlatformOnlyError', status: 403 }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'Self-hosted deployment, there is no admin (identity.platform_disabled)',
        example: { type: 'identity.platform_disabled', title: 'PlatformDisabledError', status: 404 }
    })
    public async recent(@Query() query: AuditQueryDto): Promise<AuditListView> {
        return { items: await this.audit.recent(query.limit) };
    }
}
