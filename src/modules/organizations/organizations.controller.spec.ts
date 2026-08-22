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

  it('createOrganization passes the authenticated user and org name through, and returns the created org', async () => {
    organizationsServiceMock.createOrganization.mockResolvedValue({
      id: 'org-1',
    });

    const result = await controller.createOrganization(user, {
      orgName: 'Acme',
    });

    expect(organizationsServiceMock.createOrganization).toHaveBeenCalledWith(
      user,
      'Acme',
    );
    expect(result).toEqual({ id: 'org-1' });
  });

  it('addMemberToOrg delegates with organizationId, userId, roleId and the acting user, and returns the membership', async () => {
    organizationsServiceMock.addUserToOrg.mockResolvedValue({
      id: 'membership-1',
    });

    const result = await controller.addMemberToOrg(
      user,
      { organizationId: 'org-1' },
      { userId: 'user-2', roleId: 'role-1' },
    );

    expect(organizationsServiceMock.addUserToOrg).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      'role-1',
      undefined,
      'user-1',
    );
    expect(result).toEqual({ id: 'membership-1' });
  });

  it('removeMember delegates with organizationId, userId and the acting user', async () => {
    await controller.removeMember(user, {
      organizationId: 'org-1',
      userId: 'user-2',
    });

    expect(organizationsServiceMock.removeMember).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      'user-1',
    );
  });

  it('transferOrgOwnership delegates with the authenticated user as transferor, and returns the result', async () => {
    organizationsServiceMock.transferOrgOwnership.mockResolvedValue({
      message: 'Ownership transferred successfully',
    });

    const result = await controller.transferOrgOwnership(
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
    expect(result).toEqual({ message: 'Ownership transferred successfully' });
  });

  it('createRole delegates org id, role name, permission ids, parent role id and the acting user', async () => {
    await controller.createRole(
      user,
      { organizationId: 'org-1' },
      { roleName: 'Editor', permissionIds: ['perm-1'], parentRoleId: 'role-0' },
    );

    expect(authorizationServiceMock.createRole).toHaveBeenCalledWith(
      'org-1',
      'Editor',
      ['perm-1'],
      undefined,
      'role-0',
      'user-1',
    );
  });

  it('updateRole delegates org id, role id, the update payload and the acting user', async () => {
    const payload = { roleName: 'New name' };
    await controller.updateRole(
      user,
      { organizationId: 'org-1', roleId: 'role-1' },
      payload,
    );

    expect(authorizationServiceMock.updateRole).toHaveBeenCalledWith(
      'org-1',
      'role-1',
      payload,
      'user-1',
    );
  });

  it('deleteRole delegates org id, role id and the acting user', async () => {
    await controller.deleteRole(user, {
      organizationId: 'org-1',
      roleId: 'role-1',
    });

    expect(authorizationServiceMock.deleteRole).toHaveBeenCalledWith(
      'org-1',
      'role-1',
      'user-1',
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
