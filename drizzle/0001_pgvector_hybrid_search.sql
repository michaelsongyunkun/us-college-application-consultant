ALTER TABLE "knowledge_documents"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("content", '')), 'B')
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_tsv_idx"
  ON "knowledge_documents" USING gin ("content_tsv");
