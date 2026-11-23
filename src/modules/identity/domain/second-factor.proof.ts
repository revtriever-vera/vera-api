declare const secondFactorBrand: unique symbol;

export const SECOND_FACTOR_METHODS: { readonly totp: 'totp'; readonly recoveryCode: 'recovery_code' } = {
    totp: 'totp',
    recoveryCode: 'recovery_code'
} as const;

export type SecondFactorMethod = (typeof SECOND_FACTOR_METHODS)[keyof typeof SECOND_FACTOR_METHODS];

export interface SecondFactorProof {
    readonly [secondFactorBrand]: true;
    readonly userId: string;
    readonly method: SecondFactorMethod;
}

export function proveSecondFactor(userId: string, method: SecondFactorMethod): SecondFactorProof {
    return { userId, method } as SecondFactorProof;
}
