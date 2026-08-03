-- CreateEnum
CREATE TYPE "NotifKind" AS ENUM ('reminder', 'escalation');

-- AlterTable
ALTER TABLE "care_events" ADD COLUMN     "ai_claimed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "kind" "NotifKind" NOT NULL DEFAULT 'reminder';

-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ticked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_event_id_idx" ON "attachments"("event_id");

-- CreateIndex
CREATE INDEX "care_events_schedule_id_occurred_at_idx" ON "care_events"("schedule_id", "occurred_at");

-- Backfill `kind` before the unique index below depends on it. Every existing
-- row defaulted to 'reminder', including rows that are really escalations —
-- `escalated_at` is what actually distinguishes them. Without this, an
-- escalation and the reminder it followed would collide on the new key and the
-- dedupe beneath would delete the escalation as a duplicate.
UPDATE "notifications" SET "kind" = 'escalation' WHERE "escalated_at" IS NOT NULL;

-- The old dedupe was a read followed by a write, so overlapping ticks could
-- genuinely produce duplicates; any that exist would make the unique index fail
-- to build. Collapse them, keeping the earliest row for each key.
DELETE FROM "notifications" a
USING "notifications" b
WHERE a."schedule_id" IS NOT NULL
  AND a."schedule_id" = b."schedule_id"
  AND a."user_id"     = b."user_id"
  AND a."due_at"      = b."due_at"
  AND a."channel"     = b."channel"
  AND a."kind"        = b."kind"
  AND (a."created_at", a."id") > (b."created_at", b."id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_schedule_id_user_id_due_at_channel_kind_key" ON "notifications"("schedule_id", "user_id", "due_at", "channel", "kind");

-- CreateIndex
CREATE INDEX "schedules_patient_id_updated_at_idx" ON "schedules"("patient_id", "updated_at");

-- CreateIndex
CREATE INDEX "templates_patient_id_updated_at_idx" ON "templates"("patient_id", "updated_at");

