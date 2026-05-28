import { z } from 'zod';

export const organizationRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);

export const createOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
