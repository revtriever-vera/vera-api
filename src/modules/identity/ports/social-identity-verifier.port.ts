import { LoginProvider, SocialIdentity } from '../domain/identity.types';

export type { SocialIdentity } from '../domain/identity.types';

export abstract class SocialIdentityVerifierPort {
    public abstract readonly provider: LoginProvider;
    public abstract get enabled(): boolean;
    public abstract verify(credential: string): Promise<SocialIdentity>;
}
