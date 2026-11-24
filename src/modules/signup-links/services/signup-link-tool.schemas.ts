import { createSignupLinkSchema, signupLinkIdParamsSchema, updateSignupLinkSchema } from '../validation/signup-links.schemas';

export const createSignupLinkToolShape = createSignupLinkSchema.shape;

export const updateSignupLinkToolShape = { ...signupLinkIdParamsSchema.shape, ...updateSignupLinkSchema.shape };

export const signupLinkIdToolShape = signupLinkIdParamsSchema.shape;
