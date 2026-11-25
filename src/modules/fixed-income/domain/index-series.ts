export const INDEX_SERIES: {
    readonly cdiDaily: 'cdi_daily';
    readonly ipcaMonthly: 'ipca_monthly';
    readonly selicTargetDaily: 'selic_target_daily';
} = {
    cdiDaily: 'cdi_daily',
    ipcaMonthly: 'ipca_monthly',
    selicTargetDaily: 'selic_target_daily'
};

export type IndexSeriesName = (typeof INDEX_SERIES)[keyof typeof INDEX_SERIES];

export const DEFAULT_SGS_CODES: Readonly<Record<IndexSeriesName, number>> = {
    [INDEX_SERIES.cdiDaily]: 12,
    [INDEX_SERIES.ipcaMonthly]: 433,
    [INDEX_SERIES.selicTargetDaily]: 432
};

export const INDEX_SERIES_START: string = '2010-01-01';
export const INDEX_SERIES_NAMES: readonly IndexSeriesName[] = [
    INDEX_SERIES.cdiDaily,
    INDEX_SERIES.ipcaMonthly,
    INDEX_SERIES.selicTargetDaily
];
