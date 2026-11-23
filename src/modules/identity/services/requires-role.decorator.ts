import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { UserRole } from '../domain/identity.types';

export const REQUIRED_ROLE_KEY: string = 'identity:required-role';

export const RequiresRole = (role: UserRole): CustomDecorator<string> => SetMetadata(REQUIRED_ROLE_KEY, role);
