import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { SignupEmailMarksRepository } from '../repositories/signup-email-marks.repository';

@Injectable()
export class SignupEmailMarkDomain {
    public constructor(private readonly marks: SignupEmailMarksRepository) {}

    public async claim(emailHash: string, signupLinkId: string): Promise<boolean> {
        return this.marks.claim(IdUtil.newId(), emailHash, signupLinkId);
    }
}
