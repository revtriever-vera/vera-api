import { describe, expect, it } from 'vitest';
import { SEND_OUTCOMES } from './mail.types';

describe('SEND_OUTCOMES', () => {
    it('exposes stable string values for every outcome, since they land in metric labels', () => {
        expect(SEND_OUTCOMES.accepted).toBe('accepted');
        expect(SEND_OUTCOMES.blockedByAllowlist).toBe('blocked_by_allowlist');
        expect(SEND_OUTCOMES.suppressed).toBe('suppressed');
    });
});
