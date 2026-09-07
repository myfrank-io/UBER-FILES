-- Design des cartes NFC physiques d'un chauffeur, composé par l'admin.
-- Additif : nouvelle table, aucune ligne existante affectée.

-- CreateTable
CREATE TABLE "NfcCardDesign" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL DEFAULT '#F6F1E9',
    "fgColor" TEXT NOT NULL DEFAULT '#111111',
    "logoData" TEXT,
    "logoMime" TEXT,
    "logoScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "logoOffsetX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logoOffsetY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "googleLogoStyle" TEXT NOT NULL DEFAULT 'mono',
    "name" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "qtyReview" INTEGER NOT NULL DEFAULT 10,
    "qtyBusiness" INTEGER NOT NULL DEFAULT 10,
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfcCardDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NfcCardDesign_driverId_key" ON "NfcCardDesign"("driverId");

-- AddForeignKey
ALTER TABLE "NfcCardDesign" ADD CONSTRAINT "NfcCardDesign_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
