import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PluggyConnectApplication } from '../../application/pluggy-connect.application';
import { bankConnectionsConfig } from '../../config/bank-connections.config';
import { DevRouteDisabledError } from '../../domain/bank-connections.errors';
import { DevItemCreatedBody, devItemCreatedSchema } from '../../validation/bank-connections.schemas';
import { SecretSafeValidationPipe } from '../../validation/secret-safe-validation.pipe';

@ApiExcludeController()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('editor')
@Controller('spending/connections/_dev')
export class PluggyConnectDevController {
    public constructor(
        private readonly pluggyConnect: PluggyConnectApplication,
        @Inject(bankConnectionsConfig.KEY) private readonly config: ConfigType<typeof bankConnectionsConfig>
    ) {}

    @Post('item-created')
    @HttpCode(HttpStatus.ACCEPTED)
    public async itemCreated(@Body(new SecretSafeValidationPipe(devItemCreatedSchema)) body: DevItemCreatedBody): Promise<void> {
        if (this.config.PLUGGY_DRIVER !== 'mock') {
            throw new DevRouteDisabledError();
        }
        await this.pluggyConnect.simulateItemCreated(body.itemId);
    }
}
