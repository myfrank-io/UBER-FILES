-- L'email d'un client devient optionnel : le chauffeur peut ajouter un client
-- via le bouton « Partager ma page » avec seulement son téléphone (canal SMS /
-- WhatsApp). Le flux de réservation public continue d'exiger l'email (validation
-- côté API). Le dédoublonnage manuel se fait par téléphone.
ALTER TABLE "Customer" ALTER COLUMN "email" DROP NOT NULL;

-- Index pour retrouver rapidement un client par téléphone (dédoublonnage manuel).
CREATE INDEX IF NOT EXISTS "Customer_driverId_phone_idx" ON "Customer"("driverId", "phone");
