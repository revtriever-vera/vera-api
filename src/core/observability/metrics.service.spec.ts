import { describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service';

describe('MetricsService gauges', () => {
    it('keeps the last value per label set and answers it back', () => {
        const metrics: MetricsService = new MetricsService();

        metrics.gauge('queue_oldest_waiting_job_age_seconds', 12, { queue: 'a' });
        metrics.gauge('queue_oldest_waiting_job_age_seconds', 3, { queue: 'b' });
        metrics.gauge('queue_oldest_waiting_job_age_seconds', 40, { queue: 'a' });

        expect(metrics.gaugeValue('queue_oldest_waiting_job_age_seconds', { queue: 'a' })).toBe(40);
        expect(metrics.gaugeValue('queue_oldest_waiting_job_age_seconds', { queue: 'b' })).toBe(3);
        expect(metrics.gaugeValue('queue_oldest_waiting_job_age_seconds', { queue: 'c' })).toBeNull();
    });

    it('answers null for a gauge that was never set', () => {
        expect(new MetricsService().gaugeValue('readiness_degraded')).toBeNull();
    });

    it('counts and observes without throwing', () => {
        const metrics: MetricsService = new MetricsService();

        expect(() => {
            metrics.count('email_send_total', { outcome: 'accepted' });
        }).not.toThrow();
        expect(() => {
            metrics.observe('http_request_duration_ms', 12);
        }).not.toThrow();
    });
});
