import { SystemPermissions } from './system-permissions.constant';

export const OWNER_ONLY_PERMISSIONS: SystemPermissions[] = [
  SystemPermissions['organization.transfer_ownership'],
  SystemPermissions['organization.delete'],
];
