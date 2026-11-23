export abstract class MemberDeparturePort {
    public abstract readonly area: string;
    public abstract onMemberRemoved(userId: string): Promise<void>;
}
