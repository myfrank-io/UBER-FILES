-- Remise sur une ligne de facture : un pourcentage, un montant fixe, ou
-- « offert » (un pourcentage de 100 %, qui garde la valeur d’origine visible
-- sur le document).
--
-- Additif : deux colonnes avec valeur par défaut et un enum. Les lignes
-- existantes prennent NONE / 0, soit exactement leur comportement actuel.

-- CreateEnum
CREATE TYPE "InvoiceDiscountKind" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "discountKind" "InvoiceDiscountKind" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "discountValue" INTEGER NOT NULL DEFAULT 0;

