-- Choix de règlement du client capturé dès le formulaire public de réservation.
ALTER TABLE "RideRequest" ADD COLUMN "preferredPaymentMethod" "PaymentMethod";

-- La confirmation automatique (`autoAcceptQuotes`) s'étend désormais aux courses
-- réglées sur place. Les chauffeurs dont le « paiement immédiat » était inopérant
-- (paiement en ligne non fonctionnel) étaient de facto en validation manuelle :
-- on fige ce comportement pour ne pas les basculer en confirmation automatique
-- à leur insu.
UPDATE "Driver" SET "autoAcceptQuotes" = false
WHERE "autoAcceptQuotes" = true
  AND NOT (
    'STRIPE_PREPAYMENT'::"PaymentMethod" = ANY("paymentMethods")
    AND (
      ("paymentProvider" = 'SUMUP' AND "sumupConnected")
      OR ("paymentProvider" = 'STRIPE' AND "stripeChargesEnabled")
    )
  );
