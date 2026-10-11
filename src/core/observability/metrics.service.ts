import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Meter, metrics, ObservableGauge, ObservableResult } from '@opentelemetry/api';

const SCOPE: string = 'vera-api';

export type MetricLabels = Readonly<Record<string, string>>;

interface GaugeSeries {
    readonly labels: MetricLabels;
    value: number;
}

@Injectable()
export class MetricsService {
    private readonly meter: Meter = metrics.getMeter(SCOPE);
    private readonly counters: Map<string, Counter> = new Map<string, Counter>();
    private readonly histograms: Map<string, Histogram> = new Map<string, Histogram>();
    private readonly gauges: Map<string, Map<string, GaugeSeries>> = new Map<string, Map<string, GaugeSeries>>();

    public count(name: string, labels: MetricLabels = {}, amount: number = 1): void {
        this.counterFor(name).add(amount, labels);
    }

    public observe(name: string, value: number, labels: MetricLabels = {}): void {
        this.histogramFor(name).record(value, labels);
    }

    public gauge(name: string, value: number, labels: MetricLabels = {}): void {
        const series: Map<string, GaugeSeries> = this.gaugeSeriesFor(name);
        const key: string = JSON.stringify(labels);
        const known: GaugeSeries | undefined = series.get(key);
        if (known) {
            known.value = value;
            return;
        }
        series.set(key, { labels, value });
    }

    public gaugeValue(name: string, labels: MetricLabels = {}): number | null {
        return this.gauges.get(name)?.get(JSON.stringify(labels))?.value ?? null;
    }

    private counterFor(name: string): Counter {
        const known: Counter | undefined = this.counters.get(name);
        if (known) {
            return known;
        }
        const created: Counter = this.meter.createCounter(name);
        this.counters.set(name, created);
        return created;
    }

    private histogramFor(name: string): Histogram {
        const known: Histogram | undefined = this.histograms.get(name);
        if (known) {
            return known;
        }
        const created: Histogram = this.meter.createHistogram(name);
        this.histograms.set(name, created);
        return created;
    }

    private gaugeSeriesFor(name: string): Map<string, GaugeSeries> {
        const known: Map<string, GaugeSeries> | undefined = this.gauges.get(name);
        if (known) {
            return known;
        }
        const series: Map<string, GaugeSeries> = new Map<string, GaugeSeries>();
        const gauge: ObservableGauge = this.meter.createObservableGauge(name);
        gauge.addCallback((result: ObservableResult) => {
            for (const entry of series.values()) {
                result.observe(entry.value, entry.labels);
            }
        });
        this.gauges.set(name, series);
        return series;
    }
}
