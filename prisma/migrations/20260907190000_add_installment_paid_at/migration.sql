-- Encaissement échéance par échéance.
-- Additive et optionnelle. Les factures déjà marquées PAYÉE sont rattrapées :
-- leurs échéances passent à la date de règlement de la facture, sinon à sa date
-- d'émission — sans quoi le « cash encaissé » repartirait de zéro.
ALTER TABLE "InvoiceInstallment" ADD COLUMN "paidAt" TIMESTAMP(3);

UPDATE "InvoiceInstallment" AS i
SET "paidAt" = COALESCE(f."paidAt", f."issuedAt")
FROM "Invoice" AS f
WHERE f."id" = i."invoiceId" AND f."status" = 'PAID';
