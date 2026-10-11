import { loadEnvFile } from 'node:process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { AggregationType, PeriodicExportingMetricReader, ViewOptions } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SERVICE_NAME: string = 'vera-api';
const SERVICE_NAMESPACE: string = 'vera';
const METRIC_INTERVAL_MS: number = 60_000;
export const DURATION_BUCKETS_MS: readonly number[] = [250, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000];

export function durationViews(): ViewOptions[] {
    return [
        {
            instrumentName: '*_duration_ms',
            aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [...DURATION_BUCKETS_MS] } }
        }
    ];
}

function loadLocalEnv(): void {
    try {
        loadEnvFile();
    } catch {
        void 0;
    }
}

export function resourceAttributes(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
    return {
        'service.namespace': SERVICE_NAMESPACE,
        [ATTR_SERVICE_NAME]: env['OTEL_SERVICE_NAME'] ?? SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: env['APP_VERSION'] ?? env['npm_package_version'] ?? '0.0.0',
        'deployment.environment.name': env['DEPLOY_ENV'] ?? env['NODE_ENV'] ?? 'development'
    };
}

function buildSdk(): NodeSDK {
    return new NodeSDK({
        resource: resourceFromAttributes(resourceAttributes()),
        traceExporter: new OTLPTraceExporter(),
        metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
            exportIntervalMillis: METRIC_INTERVAL_MS
        }),
        views: durationViews(),
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': { enabled: false },
                '@opentelemetry/instrumentation-net': { enabled: false },
                '@opentelemetry/instrumentation-dns': { enabled: false },
                '@opentelemetry/instrumentation-pino': { enabled: true }
            })
        ]
    });
}

export function startTracing(): NodeSDK | null {
    loadLocalEnv();
    const endpoint: string | undefined = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    if (!endpoint) {
        return null;
    }
    const sdk: NodeSDK = buildSdk();
    sdk.start();
    return sdk;
}
