import { Injectable } from '@nestjs/common';
import { ExchangeRateReaderService, StoredRate } from '../../market-data/services/exchange-rate-reader.service';
import { readB3Report } from '../domain/b3/b3-file.reader';
import { readCryptoCsv } from '../domain/crypto/crypto-csv.reader';
import { CryptoReading, UsdRates } from '../domain/crypto/crypto-events.types';
import { cryptoStatementOf, usdDatesOf } from '../domain/crypto/crypto-statement';
import {
    foreignStatementOf,
    isForeignStatement,
    rateIsUsable,
    USD,
    UsdRate,
    UsdRateTable,
    usdDatesOf as foreignDatesOf
} from '../domain/foreign/foreign-statement';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';
import { ModelReaderService } from './model-reader.service';

@Injectable()
export class StatementReaderService {
    public constructor(
        private readonly rates: ExchangeRateReaderService,
        private readonly model: ModelReaderService
    ) {}

    public async read(bytes: Buffer, modelConsent: boolean): Promise<ParsedInvestmentStatement> {
        if (this.model.accepts(bytes)) {
            return this.withDollarRates(await this.model.read(bytes, modelConsent));
        }
        const reading: CryptoReading | null = readCryptoCsv(bytes);
        return reading === null ? readB3Report(bytes) : cryptoStatementOf(reading, await this.usdRatesOf(reading));
    }

    private async withDollarRates(statement: ParsedInvestmentStatement): Promise<ParsedInvestmentStatement> {
        if (!isForeignStatement(statement)) {
            return statement;
        }
        const found: [string, UsdRate | null][] = await Promise.all(
            foreignDatesOf(statement).map(async (date: string): Promise<[string, UsdRate | null]> => [date, await this.rateOn(date)])
        );
        const table: UsdRateTable = new Map(
            found.flatMap(([date, rate]: [string, UsdRate | null]): [string, UsdRate][] => (rate === null ? [] : [[date, rate]]))
        );
        return foreignStatementOf(statement, table);
    }

    private async rateOn(date: string): Promise<UsdRate | null> {
        const stored: StoredRate | null = await this.rates.latest(USD, new Date(`${date}T12:00:00Z`));
        if (stored === null || !rateIsUsable(date, stored.date)) {
            return null;
        }
        return { brlPerUnit: stored.brlPerUnit, date: stored.date };
    }

    private async usdRatesOf(reading: CryptoReading): Promise<UsdRates> {
        const found: [string, StoredRate | null][] = await Promise.all(
            usdDatesOf(reading).map(async (date: string): Promise<[string, StoredRate | null]> => [
                date,
                await this.rates.latest('USD', new Date(`${date}T12:00:00Z`))
            ])
        );
        return new Map(
            found.flatMap(([date, rate]: [string, StoredRate | null]): [string, string][] =>
                rate === null ? [] : [[date, rate.brlPerUnit]]
            )
        );
    }
}
