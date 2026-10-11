import { Injectable } from '@nestjs/common';
import { ThrottlesRepository } from '../repositories/throttles.repository';

@Injectable()
export class ThrottleDomain {
    public constructor(private readonly throttles: ThrottlesRepository) {}

    public async registerAttempt(key: string, windowSeconds: number): Promise<number> {
        return this.throttles.registerAttempt(key, windowSeconds);
    }
}
