-- DropForeignKey
ALTER TABLE "MagicLink" DROP CONSTRAINT "MagicLink_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserSession" DROP CONSTRAINT "UserSession_user_id_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(6),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRolePermission" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "OrgRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRole" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "role_name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "parent_role_id" UUID,

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMembership" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "orgRole_id" UUID NOT NULL,

    CONSTRAINT "OrgMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "org_id" UUID,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "prev_hash" TEXT NOT NULL,
    "entry_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OAuthAccount_user_id_idx" ON "OAuthAccount"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_provider_account_id_key" ON "OAuthAccount"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_org_id_role_name_key" ON "OrgRole"("org_id", "role_name");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMembership_user_id_orgRole_id_key" ON "OrgMembership"("user_id", "orgRole_id");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMembership_user_id_org_id_key" ON "OrgMembership"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_entry_hash_key" ON "AuditLog"("entry_hash");

-- CreateIndex
CREATE INDEX "AuditLog_org_id_idx" ON "AuditLog"("org_id");

-- CreateIndex
CREATE INDEX "AuditLog_actor_user_id_idx" ON "AuditLog"("actor_user_id");

-- CreateIndex
CREATE INDEX "AuditLog_sequence_idx" ON "AuditLog"("sequence");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRolePermission" ADD CONSTRAINT "OrgRolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "OrgRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRolePermission" ADD CONSTRAINT "OrgRolePermission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRole" ADD CONSTRAINT "OrgRole_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRole" ADD CONSTRAINT "OrgRole_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "OrgRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_orgRole_id_fkey" FOREIGN KEY ("orgRole_id") REFERENCES "OrgRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
