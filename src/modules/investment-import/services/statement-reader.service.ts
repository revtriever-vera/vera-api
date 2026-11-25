import { Injectable } from '@nestjs/common';
import { ExchangeRateReaderService, StoredRate } from '../../market-data/services/exchange-rate-reader.service';
import { readB3Report } from '../domain/b3/b3-file.reader';
import { readCryptoCsv } from '../domain/crypto/crypto-csv.reader';
import { CryptoReading, UsdRates } from '../domain/crypto/crypto-events.types';
import { cryptoStatementOf, usdDatesOf } from '../domain/crypto/crypto-statement';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';

@Injectable()
export class StatementReaderService {
    public constructor(private readonly rates: ExchangeRateReaderService) {}

    public async read(bytes: Buffer): Promise<ParsedInvestmentStatement> {
        const reading: CryptoReading | null = readCryptoCsv(bytes);
        return reading === null ? readB3Report(bytes) : cryptoStatementOf(reading, await this.usdRatesOf(reading));
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
