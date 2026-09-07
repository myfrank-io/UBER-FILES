-- Adresse de livraison des cartes NFC imprimées.
-- Additive et entièrement optionnelle : les designs existants restent valides,
-- l'adresse est ensuite saisie par l'admin ou par le chauffeur lui-même depuis
-- le lien public /livraison/{proposalToken}.
ALTER TABLE "NfcCardDesign"
  ADD COLUMN "shipFirstName" TEXT,
  ADD COLUMN "shipLastName" TEXT,
  ADD COLUMN "shipAddress" TEXT,
  ADD COLUMN "shipPostalCode" TEXT,
  ADD COLUMN "shipCity" TEXT,
  ADD COLUMN "shipPhone" TEXT,
  ADD COLUMN "shipFilledAt" TIMESTAMP(3);
