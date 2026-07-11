-- Mise à disposition : la grille dégressive par paliers (HourlyRateTier) devient
-- « tarif de base + heure supplémentaire », portée par trois colonnes sur Driver.
-- Conversion des grilles existantes :
--   · le palier le plus bas devient le tarif de base ;
--   · le 2e palier devient le tarif d'heure supplémentaire, applicable au-delà
--     de (minHours - 1) heures — au plus près de l'ancienne grille ;
--   · les paliers suivants éventuels sont abandonnés ;
--   · un chauffeur sans palier reste sans mise à disposition (colonnes NULL).

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "hourlyOvertimeAfterHours" INTEGER,
ADD COLUMN     "hourlyOvertimeRateCents" INTEGER,
ADD COLUMN     "hourlyRateCents" INTEGER;

-- Backfill : tarif de base = palier le plus bas
UPDATE "Driver" d
SET "hourlyRateCents" = t."pricePerHourCents"
FROM (
  SELECT DISTINCT ON ("driverId") "driverId", "pricePerHourCents"
  FROM "HourlyRateTier"
  ORDER BY "driverId", "minHours" ASC
) t
WHERE t."driverId" = d."id";

-- Backfill : heure supplémentaire = 2e palier
UPDATE "Driver" d
SET "hourlyOvertimeAfterHours" = t."minHours" - 1,
    "hourlyOvertimeRateCents"  = t."pricePerHourCents"
FROM (
  SELECT "driverId", "minHours", "pricePerHourCents",
         ROW_NUMBER() OVER (PARTITION BY "driverId" ORDER BY "minHours" ASC) AS rn
  FROM "HourlyRateTier"
) t
WHERE t."driverId" = d."id" AND t.rn = 2 AND t."minHours" > 1;

-- DropForeignKey
ALTER TABLE "HourlyRateTier" DROP CONSTRAINT "HourlyRateTier_driverId_fkey";

-- DropTable
DROP TABLE "HourlyRateTier";
