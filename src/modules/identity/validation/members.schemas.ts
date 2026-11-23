import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { USER_ROLES } from '../domain/identity.types';

const roleSchema = z.nativeEnum(USER_ROLES).describe('`owner` runs the account, `editor` changes its data, `viewer` only reads');

export const inviteMemberSchema = z
    .object({
        email: z.string().trim().email().max(254).describe('Email the invite link is sent to; the person must sign in with this email'),
        role: roleSchema
    })
    .strict();

export class InviteMemberDto extends createZodDto(inviteMemberSchema) {}

export const changeRoleSchema = z.object({ role: roleSchema }).strict();

export class ChangeRoleDto extends createZodDto(changeRoleSchema) {}

export const memberSchema = z.object({
    userId: z.string().uuid().describe('Person id'),
    name: z.string().describe('Person display name'),
    email: z.string().nullable().describe('Email; only the owner sees the email of other people, the rest get null'),
    role: roleSchema,
    isYou: z.boolean().describe('True for the person who is asking'),
    joinedAt: z.string().datetime().describe('When the person joined the account (ISO 8601)')
});

export const pendingInviteSchema = z.object({
    id: z.string().uuid().describe('Invite id'),
    email: z.string().describe('Email the invite was sent to'),
    role: roleSchema,
    expiresAt: z.string().datetime().describe('When the link stops working (ISO 8601)'),
    lastSentAt: z.string().datetime().describe('When the link was last sent (ISO 8601)')
});

export const membersListSchema = z.object({
    members: z.array(memberSchema).describe('Active people of the account'),
    invites: z.array(pendingInviteSchema).describe('Pending invites; always empty for people who are not the owner')
});

export const inviteResultSchema = z.object({
    invite: z.object({
        id: z.string().uuid().describe('Invite id'),
        email: z.string().describe('Email the invite was sent to'),
        role: roleSchema,
        expiresAt: z.string().datetime().describe('When the link stops working (ISO 8601)')
    })
});

export const memberResultSchema = z.object({ member: memberSchema });

export const publicInviteSchema = z.object({
    inviterName: z.string().describe('First name of the person who invited'),
    accountName: z.string().describe('Name of the account the invite gives access to'),
    role: roleSchema,
    emailMasked: z.string().describe('Invited email with the local part masked, e.g. l***@gmail.com'),
    expiresAt: z.string().datetime().describe('When the link stops working (ISO 8601)')
});

export type MembersList = z.infer<typeof membersListSchema>;
export type MemberView = z.infer<typeof memberSchema>;
export type InviteResult = z.infer<typeof inviteResultSchema>;
export type MemberResult = z.infer<typeof memberResultSchema>;
export type PublicInvite = z.infer<typeof publicInviteSchema>;
