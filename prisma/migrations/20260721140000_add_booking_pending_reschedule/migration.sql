-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "pendingScheduledAt" TIMESTAMP(3),
ADD COLUMN     "pendingRequestedAt" TIMESTAMP(3);
