import { describe, expect, it } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { PlatformDisabledError, PlatformOnlyError } from '../domain/identity.errors';
import { PlatformAvailabilityService } from './platform-availability.service';
import { PlatformEnabledGuard } from './platform-enabled.guard';
import { PlatformGuard } from './platform.guard';

describe('PlatformGuard', () => {
    const context: AlsAppContext = new AlsAppContext();
    const guard: PlatformGuard = new PlatformGuard(context);
    const inRequest = <T>(platform: boolean | undefined, fn: () => T): T =>
        context.run({ requestId: 'req-1', locale: 'pt-BR', platform }, fn);

    it('deixa passar a sessão com o claim platform', () => {
        expect(inRequest(true, () => guard.canActivate())).toBe(true);
    });

    it('recusa a sessão sem o claim e a chamada sem contexto', () => {
        expect(() => inRequest(undefined, () => guard.canActivate())).toThrow(PlatformOnlyError);
        expect(() => inRequest(false, () => guard.canActivate())).toThrow(PlatformOnlyError);
        expect(() => guard.canActivate()).toThrow(PlatformOnlyError);
    });
});

describe('PlatformEnabledGuard', () => {
    it('responde 404 na auto-hospedada e passa na hospedada', () => {
        const enabled = (value: boolean): PlatformEnabledGuard =>
            new PlatformEnabledGuard({ enabled: () => value } as unknown as PlatformAvailabilityService);

        expect(enabled(true).canActivate()).toBe(true);
        expect(() => enabled(false).canActivate()).toThrow(PlatformDisabledError);
    });
});
