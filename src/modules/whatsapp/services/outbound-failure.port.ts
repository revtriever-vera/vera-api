export type OutboundFailure = {
    readonly messageId: string;
    readonly kind: string;
    readonly errorCode: string;
};

export abstract class OutboundFailurePort {
    public abstract onOutboundFailed(failure: OutboundFailure): Promise<void>;
}
