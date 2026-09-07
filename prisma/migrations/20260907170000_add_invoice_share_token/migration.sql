-- Lien public d’une facture : le chauffeur l’ouvre depuis le message qu’on lui
-- envoie, sans compte. Le jeton est la seule protection — aléatoire, long, et
-- il ne donne accès qu’à ce document.
--
-- Additif : une colonne nullable et son index d’unicité.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shareToken_key" ON "Invoice"("shareToken");

