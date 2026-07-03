-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "modelFamily" TEXT NOT NULL,
    "modelLabel" TEXT NOT NULL,
    "vehicleClass" TEXT,
    "seats" INTEGER,
    "color" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle"("driverId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise des données : créer un véhicule à partir du véhicule unique déjà saisi
-- sur le profil de chaque chauffeur (champs vehicleMake / vehicleModel conservés).
INSERT INTO "Vehicle" (
    "id", "driverId", "make", "modelFamily", "modelLabel",
    "vehicleClass", "seats", "isPrimary", "position", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    lower(coalesce("vehicleMake", '')),
    lower(replace(coalesce("vehicleModel", ''), ' ', '-')),
    trim(concat_ws(' ', "vehicleMake", "vehicleModel")),
    "vehicleClass",
    "vehicleSeats",
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Driver"
WHERE nullif(trim(concat_ws(' ', "vehicleMake", "vehicleModel")), '') IS NOT NULL;
