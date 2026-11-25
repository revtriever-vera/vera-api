import { redactPersonalData } from '../../../shared/utils/personal-data-redaction';
import { AskVeraTurn } from './ask-vera.types';

export function redactTurns(turns: readonly AskVeraTurn[]): readonly AskVeraTurn[] {
    return turns.map((turn: AskVeraTurn): AskVeraTurn => ({ ...turn, text: redactPersonalData(turn.text) }));
}
