import { Controller, Delete, Get, Header, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { CalendarConnectionApplication } from '../../application/calendar-connection.application';
import { ConnectionViewResponse, EventsResponse, connectionViewSchema, eventsResponseSchema } from '../../validation/calendar.schemas';

const NO_STORE: string = 'no-store';

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const DISABLED_EXAMPLE: Record<string, unknown> = {
    type: 'calendar.provider_disabled',
    title: 'CalendarProviderDisabledError',
    status: 503
};

const VIEW_EXAMPLE: ConnectionViewResponse = {
    status: 'active',
    email: 'ana@exemplo.com',
    connectedAt: '2026-11-22T12:00:00.000Z',
    access: 'read_write'
};

const EVENTS_EXAMPLE: EventsResponse = {
    items: [
        {
            id: 'vera3k1m0c7n2p9q8r5s4t1u6v0a2b',
            title: 'Revisão da carteira com a Ana',
            start: '2026-11-24T13:00:00.000Z',
            end: '2026-11-24T14:00:00.000Z',
            allDay: false,
            byVera: true
        }
    ]
};

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('viewer')
@Controller('calendar')
export class CalendarController {
    public constructor(private readonly calendar: CalendarConnectionApplication) {}

    @Get('connection')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Google Calendar connection of the signed-in person',
        description:
            'Returns none, active or revoked (Google no longer accepts the permission), the Google account e-mail and whether ' +
            'the permission is read only. Connections are personal: nobody else in the account sees them.'
    })
    @ApiZodResponse({ status: 200, description: 'Connection state', schema: connectionViewSchema, example: VIEW_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 503,
        description: 'Google Calendar is not configured (calendar.provider_disabled)',
        example: DISABLED_EXAMPLE
    })
    public async connection(): Promise<ConnectionViewResponse> {
        return this.calendar.view();
    }

    @Get('events')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Upcoming events of the signed-in person',
        description:
            'Reads the next seven days, at most ten events, straight from Google (no cache). byVera marks the events Vera created ' +
            'after the person confirmed them in WhatsApp.'
    })
    @ApiZodResponse({ status: 200, description: 'Upcoming events', schema: eventsResponseSchema, example: EVENTS_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The person has no active connection (calendar.not_connected)',
        example: { type: 'calendar.not_connected', title: 'CalendarNotConnectedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'Google did not answer in time (calendar.provider_unavailable) or the feature is off (calendar.provider_disabled)',
        example: { type: 'calendar.provider_unavailable', title: 'CalendarProviderUnavailableError', status: 503 }
    })
    public async events(): Promise<EventsResponse> {
        return this.calendar.events();
    }

    @Delete('connection')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Disconnect Google Calendar and revoke the permission',
        description:
            'Revokes the permission at Google, erases the stored token and marks the connection as disconnected. A Google error ' +
            'while revoking does not stop the local erase. Any role, including viewer, can disconnect their own calendar.'
    })
    @ApiNoContentResponse({ description: 'Disconnected (also when there was nothing to disconnect)' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async disconnect(): Promise<void> {
        await this.calendar.disconnect();
    }
}
