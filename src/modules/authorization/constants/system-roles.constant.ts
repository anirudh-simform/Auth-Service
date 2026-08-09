export const SystemRoles = {
  Admin: 'Admin',
  Owner: 'Owner',
  Member: 'Member',
} as const;

export type SystemRoles = keyof typeof SystemRoles;
