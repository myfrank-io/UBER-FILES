-- Suivi de course jour J : étapes horodatées (en route / sur place / à bord),
-- ETA recalculée avec trafic, dernière position du chauffeur (partage Telegram
-- « position en direct ») et itinéraire courant pour la carte client.
-- Purement additif (colonnes nullables, aucun impact sur l'existant).

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "departedAt" TIMESTAMP(3),
ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "trackingEtaAt" TIMESTAMP(3),
ADD COLUMN     "trackingEtaComputedAt" TIMESTAMP(3),
ADD COLUMN     "driverLat" DOUBLE PRECISION,
ADD COLUMN     "driverLng" DOUBLE PRECISION,
ADD COLUMN     "driverHeading" DOUBLE PRECISION,
ADD COLUMN     "driverPositionAt" TIMESTAMP(3),
ADD COLUMN     "trackingPolyline" TEXT;
