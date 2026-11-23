import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaidFeature } from '../domain/plans.types';
import { PlanGateService } from './plan-gate.service';
import { REQUIRED_FEATURE_KEY } from './requires-feature.decorator';

@Injectable()
export class PremiumGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly gate: PlanGateService
    ) {}

    // eslint-disable-next-line sonar/S3516 -- o guard só nega lançando; o retorno é sempre true quando passa
    public async canActivate(executionContext: ExecutionContext): Promise<boolean> {
        const feature: PaidFeature | undefined = this.reflector.getAllAndOverride<PaidFeature | undefined>(REQUIRED_FEATURE_KEY, [
            executionContext.getHandler(),
            executionContext.getClass()
        ]);
        if (feature === undefined) {
            return true;
        }
        await this.gate.assert(feature);
        return true;
    }
}
