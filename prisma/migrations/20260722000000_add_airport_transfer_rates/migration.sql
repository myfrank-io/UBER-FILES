-- Transferts aéroport : forfaits fixes Orly/Roissy ↔ rive droite/gauche (valables
-- dans les deux sens) + prix au km hors Paris sur Driver, et trace du choix du
-- client (aéroport, sens, zone) sur RideRequest. Purement additif.

-- CreateEnum
CREATE TYPE "AirportDirection" AS ENUM ('FROM_AIRPORT', 'TO_AIRPORT');

-- CreateEnum
CREATE TYPE "AirportZone" AS ENUM ('RIVE_DROITE', 'RIVE_GAUCHE', 'HORS_PARIS');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "airportCdgRiveDroiteCents" INTEGER,
ADD COLUMN     "airportCdgRiveGaucheCents" INTEGER,
ADD COLUMN     "airportKmRateCents" INTEGER,
ADD COLUMN     "airportOrlyRiveDroiteCents" INTEGER,
ADD COLUMN     "airportOrlyRiveGaucheCents" INTEGER;

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "airportDirection" "AirportDirection",
ADD COLUMN     "airportHub" TEXT,
ADD COLUMN     "airportZone" "AirportZone";
