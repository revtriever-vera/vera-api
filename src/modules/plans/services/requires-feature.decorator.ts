import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { PaidFeature } from '../domain/plans.types';

export const REQUIRED_FEATURE_KEY: string = 'plans:required-feature';

export const ALLOW_PAUSED_KEY: string = 'plans:allow-paused';

export const RequiresFeature = (feature: PaidFeature): CustomDecorator => SetMetadata(REQUIRED_FEATURE_KEY, feature);

/** A rota não gasta cota: com a cota esgotada (`paused`) ela segue passando; plano e chave seguem valendo. */
export const AllowsPausedUsage = (): CustomDecorator => SetMetadata(ALLOW_PAUSED_KEY, true);
