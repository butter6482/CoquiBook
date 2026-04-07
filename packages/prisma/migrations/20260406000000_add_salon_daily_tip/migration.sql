-- CreateTable (IF NOT EXISTS — safe to run even if db push already created the table)
CREATE TABLE IF NOT EXISTS "public"."SalonDailyTip" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "staffUserId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalonDailyTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS — safe to re-run)
CREATE UNIQUE INDEX IF NOT EXISTS "SalonDailyTip_date_staffUserId_key" ON "public"."SalonDailyTip"("date", "staffUserId");
