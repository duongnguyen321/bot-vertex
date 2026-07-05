-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "linkedTelegramUserIds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BillListEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderDisplayName" TEXT NOT NULL,
    "senderCanonicalName" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Person_chatId_idx" ON "Person"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_chatId_canonicalName_key" ON "Person"("chatId", "canonicalName");

-- CreateIndex
CREATE INDEX "BillListEntry_chatId_idx" ON "BillListEntry"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "BillListEntry_chatId_messageId_key" ON "BillListEntry"("chatId", "messageId");
