-- Code de vérification par email pour ouvrir le parcours de configuration via
-- le lien admin. Additif, valeurs par défaut : aucune ligne existante affectée.

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "setupCodeHash" TEXT,
ADD COLUMN     "setupCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "setupCodeSentAt" TIMESTAMP(3),
ADD COLUMN     "setupCodeAttempts" INTEGER NOT NULL DEFAULT 0;
