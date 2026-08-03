-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'caregiver', 'viewer');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('nebulizer_treatment', 'medication', 'meal', 'hydration', 'mood_behavior', 'vitals', 'toileting', 'sleep', 'activity', 'incident', 'observation_other');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('pending_ai', 'needs_review', 'confirmed', 'ai_failed');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('photo', 'audio');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('active', 'paused');

-- CreateEnum
CREATE TYPE "NotifChannel" AS ENUM ('push', 'sms', 'in_app');

-- CreateEnum
CREATE TYPE "NotifDelivery" AS ENUM ('sent', 'logged_only', 'failed');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('bug', 'feedback', 'request');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificationtokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "medical_notes" TEXT,
    "medications" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "caregiver_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_events" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "category" "EventCategory",
    "status" "EventStatus" NOT NULL DEFAULT 'pending_ai',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "raw_input" TEXT,
    "structured_data" JSONB,
    "ai_confidence" DOUBLE PRECISION,
    "ai_flags" TEXT[],
    "ai_model_version" TEXT,
    "schedule_id" TEXT,
    "template_id" TEXT,
    "has_conflict" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "client_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "care_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "uploaded_at" TIMESTAMP(3),
    "transcript" TEXT,
    "vision_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "defaults" JSONB NOT NULL,
    "icon" TEXT,
    "created_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "template_id" TEXT,
    "name" TEXT NOT NULL,
    "rrule" TEXT NOT NULL,
    "window_minutes" INTEGER NOT NULL DEFAULT 90,
    "remind_offsets" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "escalation" JSONB,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "user_id" TEXT NOT NULL,
    "channel" "NotifChannel" NOT NULL,
    "delivery_status" "NotifDelivery",
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "FeedbackType" NOT NULL DEFAULT 'bug',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "page_url" TEXT,
    "user_agent" TEXT,
    "user_email" TEXT,
    "screenshots" JSONB,
    "notion_url" TEXT,
    "notion_page_id" TEXT,
    "notion_synced_at" TIMESTAMP(3),
    "notion_sync_attempts" INTEGER NOT NULL DEFAULT 0,
    "notion_last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verificationtokens_token_key" ON "verificationtokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verificationtokens_identifier_token_key" ON "verificationtokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "caregiver_assignments_user_id_patient_id_key" ON "caregiver_assignments"("user_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_events_idempotency_key_key" ON "care_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "care_events_patient_id_occurred_at_idx" ON "care_events"("patient_id", "occurred_at");

-- CreateIndex
CREATE INDEX "care_events_patient_id_updated_at_idx" ON "care_events"("patient_id", "updated_at");

-- CreateIndex
CREATE INDEX "care_events_patient_id_category_occurred_at_idx" ON "care_events"("patient_id", "category", "occurred_at");

-- CreateIndex
CREATE INDEX "notifications_schedule_id_due_at_idx" ON "notifications"("schedule_id", "due_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_acknowledged_at_due_at_idx" ON "notifications"("user_id", "acknowledged_at", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_assignments" ADD CONSTRAINT "caregiver_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_assignments" ADD CONSTRAINT "caregiver_assignments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "care_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

