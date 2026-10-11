import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { z } from 'zod';
import { ApiZodResponse } from '../../core/http/api-zod.decorators';
import { HealthService } from './services/health.service';
import { healthSchema, readinessSchema } from './validation/health.schema';

type HealthResponse = z.infer<typeof healthSchema>;
type ReadinessResponse = z.infer<typeof readinessSchema>;

@ApiTags('health')
@Controller('health')
export class HealthController {
    public constructor(private readonly health: HealthService) {}

    @Get()
    @ApiOperation({
        summary: 'Liveness',
        description: 'Responde enquanto o processo está vivo. É o que o load balancer usa para decidir reiniciar a task.'
    })
    @ApiZodResponse({ status: 200, description: 'Processo vivo', schema: healthSchema })
    public check(): HealthResponse {
        return { status: 'ok' };
    }

    @Get('ready')
    @ApiOperation({
        summary: 'Readiness',
        description:
            'Verifica as dependências (banco). É o que decide se a task recebe tráfego — falha aqui tira a instância do balanceamento sem matá-la.'
    })
    @ApiZodResponse({ status: 200, description: 'Pronta para receber tráfego', schema: readinessSchema })
    @ApiZodResponse({ status: 503, description: 'Degradada, não deve receber tráfego', schema: readinessSchema })
    public async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
        const readiness: ReadinessResponse = await this.health.readiness();
        response.status(readiness.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
        return readiness;
    }
}
