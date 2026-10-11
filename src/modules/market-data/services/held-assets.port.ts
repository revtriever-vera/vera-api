export abstract class HeldAssetsPort {
    public abstract listHeldAssetIdsAcrossTenants(): Promise<readonly string[]>;
}
