import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { RateLimit } from '../../../core/throttle/rate-limit.decorator';
import { InvitesApplication } from '../application/invites.application';
import { PublicInvite, publicInviteSchema } from '../validation/members.schemas';

const LOOKUP_LIMIT: number = 30;
const LOOKUP_WINDOW_SECONDS: number = 15 * 60;

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
    public constructor(private readonly invites: InvitesApplication) {}

    @Get(':token')
    @RateLimit({ key: 'invite-lookup', limit: LOOKUP_LIMIT, windowSeconds: LOOKUP_WINDOW_SECONDS, identify: (subject) => subject.ip })
    @ApiOperation({
        summary: 'Look up an invite by its link token',
        description:
            'Public, no session. Returns who invited, the account, the role and the invited email masked, so the screen can say which ' +
            'email to sign in with without exposing it to anyone who finds the link.'
    })
    @ApiZodResponse({ status: 200, description: 'Public data of the invite', schema: publicInviteSchema })
    @ApiProblemResponse({
        status: 410,
        description: 'The invite does not exist, expired, was revoked or was already used (invites.invalid)',
        example: { type: 'invites.invalid', title: 'InviteInvalidError', status: 410 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many lookups from this IP (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async lookup(@Param('token') token: string): Promise<PublicInvite> {
        return this.invites.lookup(token);
    }
}
