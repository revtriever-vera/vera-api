import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PlatformEnabledGuard } from './platform-enabled.guard';
import { PlatformGuard } from './platform.guard';

export const PlatformOnly = (): ClassDecorator & MethodDecorator =>
    applyDecorators(UseGuards(PlatformEnabledGuard, JwtAuthGuard, PlatformGuard), ApiBearerAuth());
