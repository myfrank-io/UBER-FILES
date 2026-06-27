-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'SUMUP');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'SUMUP',
ADD COLUMN     "sumupAccessToken" TEXT,
ADD COLUMN     "sumupConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sumupMerchantCode" TEXT,
ADD COLUMN     "sumupRefreshToken" TEXT,
ADD COLUMN     "sumupTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "sumupCheckoutId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "provider" "PaymentProvider" NOT NULL DEFAULT 'SUMUP',
ADD COLUMN     "sumupCheckoutId" TEXT,
ADD COLUMN     "sumupTransactionCode" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "sumupRefundTxId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Driver_sumupMerchantCode_key" ON "Driver"("sumupMerchantCode");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_sumupCheckoutId_key" ON "Quote"("sumupCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_sumupCheckoutId_key" ON "Payment"("sumupCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_sumupRefundTxId_key" ON "Refund"("sumupRefundTxId");

