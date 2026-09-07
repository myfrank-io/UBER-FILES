-- Catalogue de produits facturables : ce que l’exploitant vend habituellement,
-- pour l’ajouter à une facture en un clic. Remplace les trois préréglages qui
-- étaient codés en dur dans lib/invoice.ts.
--
-- Additif : une seule table, aucune table existante modifiée. Les trois
-- préréglages existants sont insérés à l’identique pour que rien ne soit
-- perdu au passage. Les factures déjà émises ne référencent pas ce catalogue
-- (elles portent leur propre copie de la désignation et du prix), elles ne
-- sont donc pas concernées.

-- CreateTable
CREATE TABLE "InvoiceProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceProduct_position_idx" ON "InvoiceProduct"("position");


-- Les trois préréglages historiques, repris tels quels.

INSERT INTO "InvoiceProduct" ("id", "name", "label", "unitPriceCents", "position", "updatedAt") VALUES

  ('seed_acces', 'Accès + paramétrage', E'Accès Ridewiz\n+ paramétrage', 40000, 0, CURRENT_TIMESTAMP),

  ('seed_cartes', 'Lot de 20 cartes', E'Création 20 cartes (2 × 10)\nAvis Google + carte de visite digitale\nLogo', 20000, 1, CURRENT_TIMESTAMP),

  ('seed_acces_cartes', 'Accès + QR + cartes', E'Accès Ridewiz\n+ paramétrage\nmise en place QR code + cartes', 40000, 2, CURRENT_TIMESTAMP);
