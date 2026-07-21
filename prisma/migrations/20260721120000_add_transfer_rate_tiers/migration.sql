-- Paliers dégressifs kilométriques des bandes de transfert (barème progressif :
-- chaque kilomètre est facturé au tarif de sa tranche). Purement additif : les
-- bandes existantes, sans palier, gardent leur prix unique `pricePerKmCents`.

-- CreateTable
CREATE TABLE "TransferRateTier" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "uptoKm" INTEGER,
    "pricePerKmCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferRateTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferRateTier_bandId_idx" ON "TransferRateTier"("bandId");

-- AddForeignKey
ALTER TABLE "TransferRateTier" ADD CONSTRAINT "TransferRateTier_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "TransferRateBand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
