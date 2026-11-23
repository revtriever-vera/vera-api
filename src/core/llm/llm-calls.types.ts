import { Insertable, Selectable } from 'kysely';
import { LlmCalls } from '../database/generated/database.types';

export type LlmCall = Selectable<LlmCalls>;
export type NewLlmCall = Insertable<LlmCalls>;
