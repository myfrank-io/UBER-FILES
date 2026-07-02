-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE_PREPAYMENT', 'ONSITE_CARD', 'ONSITE_CASH', 'ONSITE_CHECK');

-- AlterTable : moyens de paiement acceptés par le chauffeur (défaut : prépaiement Stripe).
ALTER TABLE "Driver" ADD COLUMN "paymentMethods" "PaymentMethod"[] DEFAULT ARRAY['STRIPE_PREPAYMENT']::"PaymentMethod"[];

-- AlterTable : moyen d'encaissement d'un paiement (défaut : prépaiement Stripe).
ALTER TABLE "Payment" ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'STRIPE_PREPAYMENT';
