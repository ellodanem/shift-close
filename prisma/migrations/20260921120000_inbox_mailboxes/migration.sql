-- CreateTable
CREATE TABLE "inbox_mailboxes" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "imap_host" TEXT NOT NULL,
    "imap_port" INTEGER NOT NULL DEFAULT 993,
    "imap_secure" BOOLEAN NOT NULL DEFAULT true,
    "imap_user" TEXT NOT NULL,
    "imap_pass" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "last_sync_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_threads" (
    "id" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "conversation_key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'Unsorted',
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignee" TEXT,
    "snippet" TEXT NOT NULL DEFAULT '',
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "from_name" TEXT NOT NULL DEFAULT '',
    "from_email" TEXT NOT NULL DEFAULT '',
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "imap_uid" INTEGER NOT NULL,
    "message_id_header" TEXT,
    "in_reply_to" TEXT,
    "from_name" TEXT NOT NULL DEFAULT '',
    "from_email" TEXT NOT NULL DEFAULT '',
    "to_json" TEXT NOT NULL DEFAULT '[]',
    "cc_json" TEXT NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    "body_html" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "blob_url" TEXT,
    "part_path" TEXT,

    CONSTRAINT "inbox_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbox_mailboxes_key_key" ON "inbox_mailboxes"("key");

-- CreateIndex
CREATE INDEX "inbox_threads_mailbox_id_last_message_at_idx" ON "inbox_threads"("mailbox_id", "last_message_at");

-- CreateIndex
CREATE INDEX "inbox_threads_status_last_message_at_idx" ON "inbox_threads"("status", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_threads_mailbox_id_conversation_key_key" ON "inbox_threads"("mailbox_id", "conversation_key");

-- CreateIndex
CREATE INDEX "inbox_messages_thread_id_sent_at_idx" ON "inbox_messages"("thread_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_messages_mailbox_id_imap_uid_key" ON "inbox_messages"("mailbox_id", "imap_uid");

-- CreateIndex
CREATE INDEX "inbox_attachments_message_id_idx" ON "inbox_attachments"("message_id");

-- AddForeignKey
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "inbox_mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "inbox_mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_attachments" ADD CONSTRAINT "inbox_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "inbox_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
