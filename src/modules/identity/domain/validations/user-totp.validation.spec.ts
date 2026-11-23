import { describe, expect, it } from 'vitest';
import { TotpAlreadyActiveError, TotpNotEnrolledError } from '../identity.errors';
import { UserTotp } from '../identity.types';
import { UserTotpValidation } from './user-totp.validation';

const PENDING: UserTotp = { id: 't', activatedAt: null } as UserTotp;
const ACTIVE: UserTotp = { id: 't', activatedAt: new Date() } as UserTotp;

describe('UserTotpValidation', () => {
    it('só o autenticador com activatedAt é ativo', () => {
        expect(UserTotpValidation.isActive(ACTIVE)).toBe(true);
        expect(UserTotpValidation.isActive(PENDING)).toBe(false);
        expect(UserTotpValidation.isActive(null)).toBe(false);
    });

    it('cadastrar de novo é possível sem autenticador ou pendente, nunca com um ativo', () => {
        expect(() => {
            UserTotpValidation.assertEnrollable(null);
        }).not.toThrow();
        expect(() => {
            UserTotpValidation.assertEnrollable(PENDING);
        }).not.toThrow();
        expect(() => {
            UserTotpValidation.assertEnrollable(ACTIVE);
        }).toThrow(TotpAlreadyActiveError);
    });

    it('ativar exige cadastro pendente e verificar exige autenticador ativo', () => {
        expect(() => {
            UserTotpValidation.assertPending(PENDING);
        }).not.toThrow();
        expect(() => {
            UserTotpValidation.assertPending(ACTIVE);
        }).toThrow(TotpNotEnrolledError);
        expect(() => {
            UserTotpValidation.assertPending(null);
        }).toThrow(TotpNotEnrolledError);
        expect(() => {
            UserTotpValidation.assertActive(ACTIVE);
        }).not.toThrow();
        expect(() => {
            UserTotpValidation.assertActive(PENDING);
        }).toThrow(TotpNotEnrolledError);
        expect(() => {
            UserTotpValidation.assertActive(null);
        }).toThrow(TotpNotEnrolledError);
    });
});
