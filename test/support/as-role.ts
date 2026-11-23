import { Account, AllocationHarness } from '../integration/support/allocation-harness';
import { User, UserRole } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';

interface InsertedUser {
    readonly id: string;
}

export async function asRole(harness: AllocationHarness, owner: Account, role: UserRole): Promise<Account> {
    const id: string = crypto.randomUUID();
    await harness.pg.query(
        `INSERT INTO "Users" ("id","companyId","email","name","role","emailVerifiedAt","termsAcceptedAt")
         VALUES ($1,$2,$3,$4,$5,now(),now())`,
        [id, owner.company.id, `${role}-${id}@example.com`, `Pessoa ${role}`, role]
    );
    const inserted: InsertedUser = { id };
    const users: UserDomain = harness.app.get(UserDomain, { strict: false });
    const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
    const user: User = await harness.inCompany(owner.company.id, async () => {
        const found: User | null = await users.findById(inserted.id);
        if (!found) {
            throw new Error('person inserted by asRole was not found');
        }
        return found;
    });
    const tokens: AuthTokens = await harness.inCompany(owner.company.id, async () =>
        issuer.issueForNewLogin(user, { ip: '203.0.113.8', userAgent: 'int-test' }, 'google')
    );
    return { company: owner.company, user, token: tokens.accessToken };
}
