import type { FastifyRequest } from 'fastify';

import { hashApiKey } from '@ravoxzap/auth';
import { prisma, type ApiKey, type OrganizationMember, type User } from '@ravoxzap/database';

import { AppError } from '../errors/app-error.js';

export type CurrentUser = User & {
  memberships: OrganizationMember[];
};

export async function getCurrentUser(request: FastifyRequest): Promise<CurrentUser> {
  const token = await request.jwtVerify<{ sub: string }>().catch(() => {
    throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
  });

  const user = await prisma.user.findUnique({
    where: { id: token.sub },
    include: { memberships: true },
  });

  if (!user) {
    throw new AppError('User not found', 401, 'USER_NOT_FOUND');
  }

  return user;
}

export async function assertOrganizationAccess(
  request: FastifyRequest,
  organizationId: string,
  roles?: Array<'OWNER' | 'ADMIN' | 'MEMBER'>,
): Promise<CurrentUser> {
  const user = await getCurrentUser(request);
  const membership = user.memberships.find(item => item.organizationId === organizationId);

  if (!membership || (roles && !roles.includes(membership.role))) {
    throw new AppError('Organization access denied', 403, 'ORG_ACCESS_DENIED');
  }

  return user;
}

export async function assertInstanceAccess(
  request: FastifyRequest,
  instanceId: string,
  roles?: Array<'OWNER' | 'ADMIN' | 'MEMBER'>,
) {
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
  });

  if (!instance) {
    throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
  }

  await assertOrganizationAccess(request, instance.organizationId, roles);
  return instance;
}

export async function authenticateApiKey(request: FastifyRequest, secret: string): Promise<ApiKey> {
  const authorization = request.headers.authorization;
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token?.startsWith('ravox_live_')) {
    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }

  const keyHash = hashApiKey(token, secret);
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      status: 'ACTIVE',
    },
  });

  if (!apiKey) {
    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return apiKey;
}
