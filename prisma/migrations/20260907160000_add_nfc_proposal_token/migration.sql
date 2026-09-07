-- Lien public de proposition des cartes NFC, envoyé au chauffeur.
-- Additif, nullable : aucune ligne existante affectée.

-- AlterTable
ALTER TABLE "NfcCardDesign" ADD COLUMN     "proposalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "NfcCardDesign_proposalToken_key" ON "NfcCardDesign"("proposalToken");
