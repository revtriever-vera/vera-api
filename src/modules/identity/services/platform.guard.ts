import { CanActivate, Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { PlatformOnlyError } from '../domain/identity.errors';

@Injectable()
export class PlatformGuard implements CanActivate {
    public constructor(private readonly context: AppContext) {}

    public canActivate(): boolean {
        if (this.context.getOrNull()?.platform !== true) {
            throw new PlatformOnlyError();
        }
        return true;
    }
}
