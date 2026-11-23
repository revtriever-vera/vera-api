import { BUTTON_TITLE_LIMIT, LIST_TITLE_LIMIT, MAX_BUTTONS, MAX_LIST_ROWS, clip } from './whatsapp-format';
import { InteractiveChoice, InteractiveChoices } from './whatsapp.types';

const LIST_BUTTON_LABEL: string = 'Options';
const BODY_LIMIT: number = 1024;

type Row = { readonly id: string; readonly title: string };

function rowOf(choice: InteractiveChoice, limit: number): Row {
    return { id: choice.id, title: clip(choice.title, limit) };
}

function buttonsOf(choices: readonly InteractiveChoice[]): Record<string, unknown> {
    return { buttons: choices.map((choice: InteractiveChoice) => ({ type: 'reply', reply: rowOf(choice, BUTTON_TITLE_LIMIT) })) };
}

function listOf(choices: readonly InteractiveChoice[]): Record<string, unknown> {
    const rows: Row[] = choices.slice(0, MAX_LIST_ROWS).map((choice: InteractiveChoice): Row => rowOf(choice, LIST_TITLE_LIMIT));
    return { button: LIST_BUTTON_LABEL, sections: [{ rows }] };
}

export function interactivePayloadOf(interactive: InteractiveChoices): Record<string, unknown> {
    const body: { text: string } = { text: clip(interactive.body, BODY_LIMIT) };
    if (interactive.choices.length <= MAX_BUTTONS) {
        return { type: 'button', body, action: buttonsOf(interactive.choices) };
    }
    return { type: 'list', body, action: listOf(interactive.choices) };
}
