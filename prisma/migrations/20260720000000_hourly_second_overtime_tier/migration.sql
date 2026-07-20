-- Mise à disposition : seconde tranche d'heures supplémentaires optionnelle
-- (« puis Z €/h au-delà de Y heures »), en plus de la tranche existante.
-- Colonnes NULL = pas de seconde tranche, comportement inchangé.

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "hourlyOvertime2AfterHours" INTEGER,
ADD COLUMN     "hourlyOvertime2RateCents" INTEGER;
