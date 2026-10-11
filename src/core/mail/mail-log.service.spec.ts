import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../observability/log.service';
import { MailLogService } from './mail-log.service';

describe('MailLogService', () => {
    it('warns with the recipient domain when a message is blocked by the allowlist', () => {
        const warn: ReturnType<typeof vi.fn> = vi.fn();
        const logService: LogService = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogService;
        const logs: MailLogService = new MailLogService(logService);

        logs.recipientBlocked('@outraempresa.com');

        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'email-send', meta: { domain: '@outraempresa.com' } }));
    });
});
