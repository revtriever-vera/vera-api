import { isWelcomeStep } from './script-turn';
import { ScriptAction, ScriptState } from './script.types';

const PORTFOLIO_WORDS: RegExp = /invest|carteira|a[çc][õo]es|corretora|cripto|fii/;
const SPENDING_WORDS: RegExp = /gast|despes|cart[ãa]o|conta|banco|extrato|econom/;
const BOTH_WORDS: RegExp = /dois|ambos|tudo|os 2/;
const FINISH_WORDS: RegExp = /conclu|terminar|finaliz|encerrar/;
const SKIP_WORDS: RegExp = /pular|depois|agora n[ãa]o|mais tarde|sair/;

function moduleChoiceOf(text: string): ScriptAction | null {
    const low: string = text.toLowerCase();
    const portfolio: boolean = PORTFOLIO_WORDS.test(low);
    const spending: boolean = SPENDING_WORDS.test(low);
    if (BOTH_WORDS.test(low) || (portfolio && spending)) {
        return { type: 'CHOOSE_MODULES', portfolio: true, spending: true, typed: text };
    }
    if (!portfolio && !spending) {
        return null;
    }
    return { type: 'CHOOSE_MODULES', portfolio, spending, typed: text };
}

function choosesModules(state: ScriptState, text: string): boolean {
    return !state.chosen && isWelcomeStep(state.step) && !text.includes('?');
}

export function textIntentsOf(state: ScriptState, text: string): readonly ScriptAction[] {
    const low: string = text.toLowerCase();
    const choice: ScriptAction | null = choosesModules(state, text) ? moduleChoiceOf(text) : null;
    const intents: ScriptAction[] = choice === null ? [] : [choice];
    if (FINISH_WORDS.test(low)) {
        intents.push({ type: 'FINISH_NOW' });
    }
    if (SKIP_WORDS.test(low)) {
        intents.push({ type: 'SKIP' });
    }
    return intents;
}
