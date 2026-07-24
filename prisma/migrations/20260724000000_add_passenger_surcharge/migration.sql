-- Supplément selon le nombre de personnes : deux montants cumulatifs (3e et 4e
-- personne) sur Driver, et trace du nombre de personnes choisi par le client sur
-- RideRequest. Purement additif (colonnes nullables, aucun impact sur l'existant).

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "passengerSurcharge3Cents" INTEGER,
ADD COLUMN     "passengerSurcharge4Cents" INTEGER;

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "passengers" INTEGER;
