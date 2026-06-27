/*
  Warnings:

  - You are about to drop the column `expiresAt` on the `MagicLink` table. All the data in the column will be lost.
  - You are about to drop the column `magicLinkType` on the `MagicLink` table. All the data in the column will be lost.
  - You are about to drop the column `tokenHash` on the `MagicLink` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `MagicLink` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[token_hash]` on the table `MagicLink` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `expires_at` to the `MagicLink` table without a default value. This is not possible if the table is not empty.
  - Added the required column `magic_link_type` to the `MagicLink` table without a default value. This is not possible if the table is not empty.
  - Added the required column `token_hash` to the `MagicLink` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `MagicLink` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `MagicLink` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MagicLink" DROP CONSTRAINT "MagicLink_userId_fkey";

-- DropIndex
DROP INDEX "MagicLink_tokenHash_key";

-- AlterTable
ALTER TABLE "MagicLink" DROP COLUMN "expiresAt",
DROP COLUMN "magicLinkType",
DROP COLUMN "tokenHash",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expires_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "magic_link_type" "MagicLinkType" NOT NULL,
ADD COLUMN     "token_hash" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_token_hash_key" ON "MagicLink"("token_hash");

-- AddForeignKey
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
