import { Reflector } from '@nestjs/core';

export const SystemPermissions = {
  'organization.read': 'organization.read',

  'organization.delete': 'organization.delete',

  'organization.transfer_ownership': 'organization.transfer_ownership',

  'organization.update': 'organization.update',

  'member.invite': 'member.invite',

  'member.remove': 'member.remove',

  'member.role.update': 'member.role.update',

  'role.create': 'role.create',

  'role.update': 'role.update',

  'role.delete': 'role.delete',

  'audit.read': 'audit.read',
} as const;

export type SystemPermissions = keyof typeof SystemPermissions;

export const Permission = Reflector.createDecorator<SystemPermissions>();
