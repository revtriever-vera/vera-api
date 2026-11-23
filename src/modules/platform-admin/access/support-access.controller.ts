import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../identity/services/roles.guard';
import { SupportAccessApplication } from '../application/support-access.application';
import { SupportAccessListView, supportAccessListSchema } from '../validation/platform-accounts.schemas';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('owner')
@Controller('account')
export class SupportAccessController {
    public constructor(private readonly access: SupportAccessApplication) {}

    @Get('support-access')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({
        summary: 'Who from the support opened this account',
        description:
            'Every time someone from the platform team opens the account data they must give a reason. This lists each opening, ' +
            'newest first: when, the operator name, the reason and the layers. Only the owner sees it.'
    })
    @ApiZodResponse({ status: 200, description: 'The openings, most recent first', schema: supportAccessListSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Only the owner can see it (members.forbidden_role)',
        example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403 }
    })
    public async list(): Promise<SupportAccessListView> {
        return this.access.list();
    }
}
