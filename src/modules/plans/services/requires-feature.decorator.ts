import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { PaidFeature } from '../domain/plans.types';

export const REQUIRED_FEATURE_KEY: string = 'plans:required-feature';

export const RequiresFeature = (feature: PaidFeature): CustomDecorator => SetMetadata(REQUIRED_FEATURE_KEY, feature);
