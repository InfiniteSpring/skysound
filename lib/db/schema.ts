import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { LightCurve, ObjectType, Params, Position, RawBundle, Sources } from "../sources/types";

export const objectStatus = pgEnum("object_status", ["ready", "fetching", "failed"]);
export type ObjectStatus = (typeof objectStatus.enumValues)[number];

export const objects = pgTable(
  "objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** Catalog identity ("jpl:599", "simbad:* alf Ori"); two slugs can never hold one object. */
    canonicalKey: text("canonical_key"),
    /** What the fetcher should resolve: a catalog ref or free text. Kept so failed rows can be retried. */
    query: text("query").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<ObjectType>(),
    description: text("description"),
    position: jsonb("position").$type<Position>(),
    params: jsonb("params").$type<Params>().notNull().default({}),
    lightCurve: jsonb("light_curve").$type<LightCurve | null>(),
    sources: jsonb("sources").$type<Sources>().notNull().default({}),
    raw: jsonb("raw").$type<RawBundle>().notNull().default({}),
    status: objectStatus("status").notNull().default("fetching"),
    error: text("error"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("objects_slug_idx").on(t.slug),
    uniqueIndex("objects_canonical_key_idx").on(t.canonicalKey),
    index("objects_type_idx").on(t.type),
    index("objects_status_idx").on(t.status),
    index("objects_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export type ObjectRow = typeof objects.$inferSelect;
