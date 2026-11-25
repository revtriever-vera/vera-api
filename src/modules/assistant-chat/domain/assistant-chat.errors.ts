import { AppError } from '../../../shared/errors/app.error';

export class TurnNotFoundError extends AppError {
    public constructor() {
        super({ code: 'assistant.turn_not_found', status: 404, detail: 'No such turn for this person.' });
    }
}
