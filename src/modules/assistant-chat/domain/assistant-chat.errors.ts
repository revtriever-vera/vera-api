import { AppError } from '../../../shared/errors/app.error';

export class TurnNotFoundError extends AppError {
    public constructor() {
        super({ code: 'assistant.turn_not_found', status: 404, detail: 'No such turn for this person.' });
    }
}

export class ActionNotFoundError extends AppError {
    public constructor() {
        super({ code: 'assistant.action_not_found', status: 404, detail: 'No such pending action for this person.' });
    }
}

export class ActionResolvedError extends AppError {
    public constructor() {
        super({ code: 'assistant.action_resolved', status: 409, detail: 'The action was already confirmed, canceled or replaced.' });
    }
}

export class ActionExpiredError extends AppError {
    public constructor() {
        super({ code: 'assistant.action_expired', status: 409, detail: 'The confirmation window of the action passed.' });
    }
}

export class TurnTextRequiredError extends AppError {
    public constructor() {
        super({ code: 'assistant.text_required', status: 400, detail: 'The question needs a `text` unless a `file` is sent.' });
    }
}

export class AttachmentRoleError extends AppError {
    public constructor() {
        super({
            code: 'members.forbidden_role',
            status: 403,
            detail: 'Importing a file needs the editor role or higher.',
            meta: { required: 'editor' }
        });
    }
}
