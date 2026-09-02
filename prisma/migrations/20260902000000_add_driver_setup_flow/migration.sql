-- Parcours de configuration guidée : jeton de lien (généré par l'admin),
-- horodatages de suivi et étapes confirmées par le chauffeur. Additif, valeurs
-- par défaut : aucun chauffeur existant n'est affecté.

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "setupToken" TEXT,
ADD COLUMN     "setupTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "setupStartedAt" TIMESTAMP(3),
ADD COLUMN     "setupCompletedAt" TIMESTAMP(3),
ADD COLUMN     "setupConfirmed" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "Driver_setupToken_key" ON "Driver"("setupToken");
