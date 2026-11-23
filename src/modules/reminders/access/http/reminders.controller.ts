import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { RemindersApplication } from '../../application/reminders.application';
import { ReminderIdParamsDto, RemindersList, remindersListSchema } from '../../validation/reminders.schemas';

const NO_STORE: string = 'no-store';

const LIST_EXAMPLE: RemindersList = {
    items: [
        {
            id: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e90',
            text: 'Fazer o aporte do mês',
            kind: 'monthly',
            nextAt: '2026-12-05T12:00:00.000Z',
            dayOfMonth: 5,
            time: '09:00',
            createdVia: 'whatsapp'
        }
    ]
};

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('viewer')
@Controller('reminders')
export class RemindersController {
    public constructor(private readonly reminders: RemindersApplication) {}

    @Get()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Active reminders of the signed-in person',
        description:
            'Lists the reminders the signed-in person created through WhatsApp, in the order of the numbered list they see in the chat. ' +
            'Reminders are personal: nobody else in the account sees them. nextAt is the next scheduled notice.'
    })
    @ApiZodResponse({ status: 200, description: 'Active reminders', schema: remindersListSchema, example: LIST_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async list(): Promise<RemindersList> {
        return this.reminders.list();
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete a reminder of the signed-in person',
        description:
            'Cancels the reminder and its pending notices. Any role, including viewer, can delete their own reminders. ' +
            'A reminder that does not exist or belongs to someone else answers 404.'
    })
    @ApiNoContentResponse({ description: 'Deleted' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 404,
        description: 'The reminder does not exist for this person (reminders.not_found)',
        example: { type: 'reminders.not_found', title: 'ReminderNotFoundError', status: 404 }
    })
    public async remove(@Param() params: ReminderIdParamsDto): Promise<void> {
        await this.reminders.remove(params.id);
    }
}
