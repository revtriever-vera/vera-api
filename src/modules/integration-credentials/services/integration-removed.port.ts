import { IntegrationKind } from '../domain/integration.types';

export abstract class IntegrationRemovedPort {
    public abstract readonly kind: IntegrationKind;
    public abstract onRemoved(): Promise<void>;
}
