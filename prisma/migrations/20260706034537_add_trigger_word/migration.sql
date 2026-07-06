-- CreateTable
CREATE TABLE "TriggerWord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TriggerWord_chatId_idx" ON "TriggerWord"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TriggerWord_chatId_word_key" ON "TriggerWord"("chatId", "word");
