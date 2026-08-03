CREATE TABLE IF NOT EXISTS "knowledge_entities" (
  "id" text PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "name" text NOT NULL,
  "aliases_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_version" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_relations" (
  "id" text PRIMARY KEY NOT NULL,
  "from_entity_id" text NOT NULL,
  "to_entity_id" text NOT NULL,
  "relation_type" text NOT NULL,
  "source_id" text DEFAULT '' NOT NULL,
  "source_version" text NOT NULL,
  "confidence" integer DEFAULT 80 NOT NULL,
  "valid_from" timestamp with time zone,
  "valid_to" timestamp with time zone,
  "official_url" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "knowledge_relations_from_entity_fk" FOREIGN KEY ("from_entity_id") REFERENCES "knowledge_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_relations_to_entity_fk" FOREIGN KEY ("to_entity_id") REFERENCES "knowledge_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_relations_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entities_type_idx" ON "knowledge_entities" ("entity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entities_name_trgm_idx" ON "knowledge_entities" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entities_aliases_idx" ON "knowledge_entities" USING gin ("aliases_json");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_relations_from_idx" ON "knowledge_relations" ("from_entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_relations_to_idx" ON "knowledge_relations" ("to_entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_relations_type_idx" ON "knowledge_relations" ("relation_type");
