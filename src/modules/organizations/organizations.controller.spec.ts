import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuthGuard } from '../auth/guards/auth/auth.guard';
import { AuthorizationGuard } from '../authorization/guards/authorization.guard';
import { User } from 'src/generated/prisma/client';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const organizationsServiceMock = {
    createOrganization: jest.fn(),
    addUserToOrg: jest.fn(),
    removeMember: jest.fn(),
    listMembers: jest.fn(),
    transferOrgOwnership: jest.fn(),
    listRoles: jest.fn(),
  };

  const authorizationServiceMock = {
    createRole: jest.fn(),
    updateRole: jest.fn(),
    deleteRole: jest.fn(),
    changeUserRole: jest.fn(),
  };

  const user = { id: 'user-1' } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: organizationsServiceMock },
        { provide: AuthorizationService, useValue: authorizationServiceMock },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createOrganization passes the authenticated user and org name through', async () => {
    await controller.createOrganization(user, { orgName: 'Acme' });

    expect(organizationsServiceMock.createOrganization).toHaveBeenCalledWith(
      user,
      'Acme',
    );
  });

  it('addMemberToOrg delegates with organizationId, userId and roleId', async () => {
    await controller.addMemberToOrg(
      user,
      { organizationId: 'org-1' },
      { userId: 'user-2', roleId: 'role-1' },
    );

    expect(organizationsServiceMock.addUserToOrg).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      'role-1',
    );
  });

  it('removeMember delegates with organizationId and userId', async () => {
    await controller.removeMember({
      organizationId: 'org-1',
      userId: 'user-2',
    });

    expect(organizationsServiceMock.removeMember).toHaveBeenCalledWith(
      'org-1',
      'user-2',
    );
  });

  it('transferOrgOwnership delegates with the authenticated user as transferor', async () => {
    await controller.transferOrgOwnership(
      user,
      { organizationId: 'org-1' },
      { tranfereeId: 'user-2', transferorReplacementOrgRoleId: 'role-1' },
    );

    expect(organizationsServiceMock.transferOrgOwnership).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      user,
      'role-1',
    );
  });

  it('createRole delegates org id, role name, permission ids and parent role id', async () => {
    await controller.createRole(
      { organizationId: 'org-1' },
      { roleName: 'Editor', permissionIds: ['perm-1'], parentRoleId: 'role-0' },
    );

    expect(authorizationServiceMock.createRole).toHaveBeenCalledWith(
      'org-1',
      'Editor',
      ['perm-1'],
      undefined,
      'role-0',
    );
  });

  it('updateRole delegates org id, role id and the update payload', async () => {
    const payload = { roleName: 'New name' };
    await controller.updateRole({ organizationId: 'org-1', roleId: 'role-1' }, payload);

    expect(authorizationServiceMock.updateRole).toHaveBeenCalledWith(
      'org-1',
      'role-1',
      payload,
    );
  });

  it('deleteRole delegates org id and role id', async () => {
    await controller.deleteRole({ organizationId: 'org-1', roleId: 'role-1' });

    expect(authorizationServiceMock.deleteRole).toHaveBeenCalledWith(
      'org-1',
      'role-1',
    );
  });

  it('updateUserRole delegates the acting user id, target user id, org id and role id in order', async () => {
    await controller.updateUserRole(
      user,
      { organizationId: 'org-1', userId: 'user-2' },
      { roleId: 'role-1' },
    );

    expect(authorizationServiceMock.changeUserRole).toHaveBeenCalledWith(
      'user-1',
      'user-2',
      'org-1',
      'role-1',
    );
  });
});
