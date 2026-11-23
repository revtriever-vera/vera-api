import { AlertData, AlertDiff, AlertRecord, DesiredAlert } from './recurring-alerts.types';

export function alertKey(alert: Pick<DesiredAlert, 'seriesId' | 'kind' | 'fingerprint'>): string {
    return `${alert.seriesId}|${alert.kind}|${alert.fingerprint}`;
}

function sameData(left: AlertData, right: AlertData): boolean {
    const keys: string[] = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key: string): boolean => left[key] === right[key]);
}

function changed(existing: AlertRecord, desired: DesiredAlert): boolean {
    return existing.occurredOn !== desired.occurredOn || !sameData(existing.data, desired.data);
}

function indexed<T extends Pick<DesiredAlert, 'seriesId' | 'kind' | 'fingerprint'>>(alerts: readonly T[]): Map<string, T> {
    return new Map<string, T>(alerts.map((alert: T): [string, T] => [alertKey(alert), alert]));
}

export function diffAlerts(existing: readonly AlertRecord[], desired: readonly DesiredAlert[]): AlertDiff {
    const stored: Map<string, AlertRecord> = indexed(existing);
    const wanted: Map<string, DesiredAlert> = indexed(desired);
    const insert: DesiredAlert[] = [];
    const update: { id: string; alert: DesiredAlert }[] = [];
    for (const [key, alert] of wanted) {
        const current: AlertRecord | undefined = stored.get(key);
        if (current === undefined) {
            insert.push(alert);
        }
        if (current !== undefined && changed(current, alert)) {
            update.push({ id: current.id, alert });
        }
    }
    const gone: AlertRecord[] = existing.filter((row: AlertRecord): boolean => !wanted.has(alertKey(row)));
    return { insert, update, removeIds: gone.map((row: AlertRecord): string => row.id) };
}
