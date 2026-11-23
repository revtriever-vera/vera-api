import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { RateLimit } from '../../../core/throttle/rate-limit.decorator';
import { InvitesApplication } from '../application/invites.application';
import { MembersApplication } from '../application/members.application';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RequiresRole } from '../services/requires-role.decorator';
import { RolesGuard } from '../services/roles.guard';
import {
    ChangeRoleDto,
    changeRoleSchema,
    InviteMemberDto,
    inviteMemberSchema,
    InviteResult,
    inviteResultSchema,
    MemberResult,
    memberResultSchema,
    MembersList,
    membersListSchema
} from '../validation/members.schemas';

type ProblemDoc = Parameters<typeof ApiProblemResponse>[0];

const INVITES_PER_DAY: number = 20;
const DAY_SECONDS: number = 24 * 60 * 60;
const RESENDS_PER_HOUR: number = 5;
const HOUR_SECONDS: number = 60 * 60;

const UNAUTHORIZED: ProblemDoc = {
    status: 401,
    description: 'Missing or invalid access token (identity.unauthorized)',
    example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
};

const FORBIDDEN: ProblemDoc = {
    status: 403,
    description: 'The role of the person is not enough (members.forbidden_role)',
    example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403 }
};

const LAST_OWNER: ProblemDoc = {
    status: 409,
    description: 'The account would be left without an owner (members.last_owner)',
    example: { type: 'members.last_owner', title: 'LastOwnerError', status: 409 }
};

const MEMBER_NOT_FOUND: ProblemDoc = {
    status: 404,
    description: 'No active person with this id in the account (members.not_found)',
    example: { type: 'members.not_found', title: 'MemberNotFoundError', status: 404 }
};

@ApiTags('members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members')
export class MembersController {
    public constructor(
        private readonly members: MembersApplication,
        private readonly invites: InvitesApplication
    ) {}

    @Get()
    @ApiOperation({
        summary: 'List the people of the account and the pending invites',
        description:
            'Any person of the account can read it. The email of other people and the pending invites are only returned to the owner.'
    })
    @ApiZodResponse({ status: 200, description: 'Active people and pending invites', schema: membersListSchema })
    @ApiProblemResponse(UNAUTHORIZED)
    public async list(): Promise<MembersList> {
        return this.members.list();
    }

    @Post('invites')
    @RequiresRole('owner')
    @RateLimit({
        key: 'members-invite',
        limit: INVITES_PER_DAY,
        windowSeconds: DAY_SECONDS,
        identify: (subject) => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Invite a person by email',
        description:
            'Sends a link that is valid for the configured days. Inviting an email that already has a pending invite resends it with the ' +
            'new role. The person enters with Google or Facebook and the verified email has to be the invited one.'
    })
    @ApiZodBody(inviteMemberSchema)
    @ApiZodResponse({ status: 201, description: 'Invite created or resent', schema: inviteResultSchema })
    @ApiProblemResponse(UNAUTHORIZED)
    @ApiProblemResponse(FORBIDDEN)
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The email is already a person of the account (invites.already_member) or the account is full (members.limit_reached)',
        example: { type: 'invites.already_member', title: 'AlreadyMemberError', status: 409 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 20 invites in a day for this account (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async invite(@Body() body: InviteMemberDto): Promise<InviteResult> {
        return this.invites.create(body.email, body.role);
    }

    @Post('invites/:inviteId/resend')
    @HttpCode(HttpStatus.OK)
    @RequiresRole('owner')
    @RateLimit({
        key: 'members-invite-resend',
        limit: RESENDS_PER_HOUR,
        windowSeconds: HOUR_SECONDS,
        identify: (subject) => subject.params['inviteId'] ?? null
    })
    @ApiOperation({
        summary: 'Resend a pending invite',
        description: 'Generates a new link, invalidates the previous one and renews the validity.'
    })
    @ApiZodResponse({ status: 200, description: 'Invite resent', schema: inviteResultSchema })
    @ApiProblemResponse(UNAUTHORIZED)
    @ApiProblemResponse(FORBIDDEN)
    @ApiProblemResponse({
        status: 404,
        description: 'No pending invite with this id (invites.not_found)',
        example: { type: 'invites.not_found', title: 'InviteNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 5 resends in an hour for this invite (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async resend(@Param('inviteId', ParseUUIDPipe) inviteId: string): Promise<InviteResult> {
        return this.invites.resend(inviteId);
    }

    @Delete('invites/:inviteId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequiresRole('owner')
    @ApiOperation({ summary: 'Revoke a pending invite', description: 'The link of the invite stops working.' })
    @ApiProblemResponse(UNAUTHORIZED)
    @ApiProblemResponse(FORBIDDEN)
    @ApiProblemResponse({
        status: 404,
        description: 'No pending invite with this id (invites.not_found)',
        example: { type: 'invites.not_found', title: 'InviteNotFoundError', status: 404 }
    })
    public async revoke(@Param('inviteId', ParseUUIDPipe) inviteId: string): Promise<void> {
        await this.invites.revoke(inviteId);
    }

    @Post('me/leave')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequiresRole('viewer')
    @ApiOperation({
        summary: 'Leave the account',
        description:
            'The person loses the access to this account and the sessions are revoked. The only owner cannot leave. To come back, ' +
            'someone in the account has to invite the person again.'
    })
    @ApiProblemResponse(UNAUTHORIZED)
    @ApiProblemResponse(LAST_OWNER)
    public async leave(): Promise<void> {
        await this.members.leave();
    }

    @Patch(':userId')
    @RequiresRole('owner')
    @ApiOperation({
        summary: 'Change the role of a person',
        description: 'The account always keeps at least one owner. Takes effect on the next request of that person.'
    })
    @ApiZodBody(changeRoleSchema)
    @ApiZodResponse({ status: 200, description: 'Person with the new role', schema: memberResultSchema })
    @ApiProblemResponse(UNAUTHORIZED)
    @ApiProblemResponse(FORBIDDEN)
    @ApiProblemResponse(MEMBER_NOT_FOUND)
    @ApiProblemResponse(LAST_OWNER)
    public async changeRole(@Param('userId', ParseUUIDPipe) userId: string, @Body() body: ChangeRoleDto): Promise<MemberResult> {
        return this.members.changeRole(userId, body.role);
    }

    @Delete(':userId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequiresRole('owner')
    @ApiOperation({
        summary: 'Remove a person from the account',
        description:
            'Revokes the sessions of the person, removes the sign-in methods, frees the email and tells the modules that hold things of ' +
            'that person. The portfolio and the expenses stay with the account.'
    })
    @ApiProblemResponse(UNAUTHORIZED)
    @ApiProblemResponse(FORBIDDEN)
    @ApiProblemResponse(MEMBER_NOT_FOUND)
    @ApiProblemResponse(LAST_OWNER)
    @ApiProblemResponse({
        status: 400,
        description: 'The owner removing themselves must use the leave endpoint (members.cannot_remove_self)',
        example: { type: 'members.cannot_remove_self', title: 'CannotRemoveSelfError', status: 400 }
    })
    public async remove(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
        await this.members.remove(userId);
    }
}
