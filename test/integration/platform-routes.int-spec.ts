import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DiscoveryService } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../../src/modules/identity/services/jwt-auth.guard';
import { PlatformEnabledGuard } from '../../src/modules/identity/services/platform-enabled.guard';
import { PlatformGuard } from '../../src/modules/identity/services/platform.guard';
import { AllocationHarness } from './support/allocation-harness';

describe('rotas /platform', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('platform_routes');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('nenhum controller de /platform fica sem a disponibilidade, a sessão e o guard da claim, nessa ordem', () => {
        const controllers: (new () => unknown)[] = harness.app
            .get(DiscoveryService)
            .getControllers()
            .flatMap((wrapper) => (wrapper.metatype ? [wrapper.metatype as new () => unknown] : []))
            .filter((controller) =>
                String(Reflect.getMetadata(PATH_METADATA, controller) ?? '')
                    .replace(/^\/+/, '')
                    .startsWith('platform')
            );

        expect(controllers.length).toBeGreaterThan(0);
        for (const controller of controllers) {
            expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([PlatformEnabledGuard, JwtAuthGuard, PlatformGuard]);
        }
    });
});
