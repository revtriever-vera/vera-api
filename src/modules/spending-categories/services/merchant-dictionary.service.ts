import { Injectable } from '@nestjs/common';
import { MERCHANT_DICTIONARY, matchDictionary } from '../domain/dictionary-matcher';
import { DictionaryEntry } from '../validation/data.schemas';

export interface MerchantMatch {
    readonly pattern: string;
    readonly category: string;
}

@Injectable()
export class MerchantDictionaryService {
    public resolve(normalizedDescription: string, amountMinor: number): MerchantMatch | null {
        const entry: DictionaryEntry | null = matchDictionary(MERCHANT_DICTIONARY, normalizedDescription, amountMinor);
        return entry === null ? null : { pattern: entry.pattern, category: entry.category };
    }
}
