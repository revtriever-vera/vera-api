export class DeadlineExceededError extends Error {
    public constructor() {
        super('deadline exceeded');
    }
}

export async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const deadline: Promise<never> = new Promise<never>((_resolve: (value: never) => void, reject: (reason: Error) => void): void => {
        timer = setTimeout((): void => {
            reject(new DeadlineExceededError());
        }, timeoutMs);
    });
    try {
        return await Promise.race([work, deadline]);
    } finally {
        clearTimeout(timer);
    }
}
