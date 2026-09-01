-- Carte de visite digitale du chauffeur (/carte/{slug}).
-- Purement additif : trois nouvelles tables + un enum, aucune table existante
-- modifiée, aucune donnée à migrer. Les cartes sont créées à la demande par
-- l'éditeur (et pré-remplies depuis le profil chauffeur existant).

-- CreateEnum
CREATE TYPE "CardBlockKind" AS ENUM ('LINK', 'SOCIAL', 'PHONE', 'EMAIL', 'WHATSAPP', 'ADDRESS', 'TEXT', 'BOOKING_CTA', 'REVIEW_CTA', 'VEHICLES');

-- CreateTable
CREATE TABLE "CardProfile" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "theme" TEXT NOT NULL DEFAULT 'signature',
    "headline" TEXT,
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardBlock" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "CardBlockKind" NOT NULL,
    "label" TEXT,
    "value" TEXT,
    "data" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardImage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardProfile_driverId_key" ON "CardProfile"("driverId");

-- CreateIndex
CREATE INDEX "CardBlock_profileId_idx" ON "CardBlock"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "CardImage_profileId_role_key" ON "CardImage"("profileId", "role");

-- AddForeignKey
ALTER TABLE "CardProfile" ADD CONSTRAINT "CardProfile_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBlock" ADD CONSTRAINT "CardBlock_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CardProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardImage" ADD CONSTRAINT "CardImage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CardProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
