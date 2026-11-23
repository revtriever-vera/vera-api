import { UsdRate } from '../usage.types';

export abstract class UsdRatePort {
    public abstract current(): Promise<UsdRate>;
}
