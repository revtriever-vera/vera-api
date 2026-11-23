import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../../src/modules/identity/services/jwt-auth.guard';
import { RequiresRole } from '../../src/modules/identity/services/requires-role.decorator';
import { RolesGuard } from '../../src/modules/identity/services/roles.guard';
import { routesOf, violationsOf } from '../support/route-roles-audit';
import { AllocationHarness } from './support/allocation-harness';

@Controller('probe')
@UseGuards(JwtAuthGuard, RolesGuard)
class WithoutRoleController {
    @Get()
    public read(): void {}

    @Post()
    public write(): void {}
}

@Controller('probe-viewer')
@UseGuards(JwtAuthGuard, RolesGuard)
class ViewerWriteController {
    @Post()
    @RequiresRole('viewer')
    public write(): void {}
}

@Controller('probe-unguarded')
@UseGuards(JwtAuthGuard)
class WithoutRolesGuardController {
    @Get()
    public read(): void {}
}

@Controller('probe-ok')
@UseGuards(JwtAuthGuard, RolesGuard)
class DeclaredController {
    @Post()
    @RequiresRole('editor')
    public write(): void {}
}

describe('cobertura de papel nas rotas', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('route_roles');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('falha numa rota de escrita sem papel, numa de viewer fora da lista e numa sem o RolesGuard', () => {
        const violations: string[] = violationsOf(
            routesOf([WithoutRoleController, ViewerWriteController, WithoutRolesGuardController, DeclaredController])
        );

        expect(violations).toEqual([
            'POST /probe: write route without @RequiresRole',
            'POST /probe-viewer: write route declared as viewer outside the allowlist',
            'GET /probe-unguarded: protected by session but without RolesGuard'
        ]);
    });

    it('passa no app real: toda rota protegida por sessão declara o papel que exige', () => {
        const controllers = harness.app
            .get(DiscoveryService)
            .getControllers()
            .flatMap((wrapper) => (wrapper.metatype ? [wrapper.metatype as new () => unknown] : []));
        const routes = routesOf(controllers);

        expect(routes.length).toBeGreaterThan(60);
        expect(violationsOf(routes)).toEqual([]);
    });
});
