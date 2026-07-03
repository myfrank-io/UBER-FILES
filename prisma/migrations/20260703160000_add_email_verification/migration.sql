-- Vérification de l'adresse email des comptes back-office.
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerificationExpiry" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerificationSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- Grandfathering : les comptes déjà existants (chauffeurs et admins) sont
-- considérés comme vérifiés — la vérification ne s'applique qu'aux nouvelles
-- inscriptions, personne n'est bloqué au déploiement.
UPDATE "User" SET "emailVerified" = true;
