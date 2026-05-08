import { createRequire } from "node:module";
import { createPrismaStore, type PrismaStoreClient } from "../packages/db/src/prisma-store.js";
import { createApp } from "../apps/api/src/server.js";

type JsonRecord = Record<string, unknown>;

const dbRequire = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = dbRequire("@prisma/client") as {
  PrismaClient: new () => {
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    person: {
      deleteMany(args: unknown): Promise<unknown>;
    };
  };
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Example: DATABASE_URL=postgresql://opendinq:opendinq@localhost:5432/opendinq pnpm verify:db");
}

const handle = `verify-db-${Date.now()}`;
const prisma = new PrismaClient();

try {
  await prisma.$connect();
  const app = createApp({
    store: createPrismaStore(prisma as unknown as PrismaStoreClient),
    seedDemo: false
  });

  const generated = await requestJson(app, "/api/profiles/generate", {
    method: "POST",
    body: JSON.stringify({
      displayName: "DB Runtime Verifier",
      handle,
      headline: "Evidence-backed DB runtime profile",
      sources: [
        {
          type: "manual",
          input: {
            title: "DB runtime verification artifact",
            url: "https://example.com/opendinq-db-runtime",
            note: "Manual product design evidence for DB-backed cards and search."
          }
        }
      ]
    }),
    headers: { "content-type": "application/json" }
  });

  assertEqual(generated.handle, handle, "profile generation returned the expected handle");
  assertNumberAtLeast(generated.cardsGenerated, 1, "profile generation created cards");
  assertNumberAtLeast(generated.claimsGenerated, 1, "profile generation created claims");
  assertNumberAtLeast(generated.artifactsImported, 1, "profile generation imported artifacts");

  const runSummary = await requestJson(app, `/api/profile-runs/${encodeURIComponent(String(generated.runId))}`);
  assertEqual(runSummary.handle, handle, "profile run summary points to the generated handle");
  assertNumberAtLeast(runSummary.cardsCount, 1, "profile run summary includes cards");

  const noteResponse = await requestJson(app, `/api/people/${encodeURIComponent(handle)}/cards/manual-note`, {
    method: "POST",
    body: JSON.stringify({
      title: "Hidden DB note",
      contentMd: "This note verifies card patching and public filtering."
    }),
    headers: { "content-type": "application/json" }
  });
  const noteCard = asRecord(noteResponse.card, "manual note card");
  const noteCardId = stringField(noteCard, "id", "manual note card id");

  const patched = await requestJson(app, `/api/cards/${encodeURIComponent(noteCardId)}`, {
    method: "PATCH",
    body: JSON.stringify({ visibility: "hidden", order: 99 }),
    headers: { "content-type": "application/json" }
  });
  assertEqual(asRecord(patched.card, "patched card").visibility, "hidden", "card patch updated visibility");

  const publicProfile = await requestJson(app, `/api/people/${encodeURIComponent(handle)}`);
  const publicCards = arrayField(publicProfile, "cards", "public profile cards");
  assert(publicCards.every((card) => asRecord(card, "card").id !== noteCardId), "hidden card is excluded from public profile");
  assert(publicCards.every((card) => asRecord(card, "card").visibility !== "hidden"), "public profile has no hidden cards");
  assertNumberAtLeast(publicCards.length, 1, "public profile still has generated cards");

  const publicCardList = await requestJson(app, `/api/people/${encodeURIComponent(handle)}/cards`);
  const listedCards = arrayField(publicCardList, "cards", "public card list");
  assert(listedCards.every((card) => asRecord(card, "listed card").id !== noteCardId), "hidden card is excluded from public card list");

  const search = await requestJson(app, `/api/search?q=${encodeURIComponent("product design DB runtime evidence")}`);
  const searchResults = arrayField(search, "results", "search results");
  const matchingResult = searchResults.map((item) => asRecord(item, "search result")).find((item) => asRecord(item.person, "search result person").handle === handle);
  assert(Boolean(matchingResult), "DB-backed generated profile appears in search");
  assertNumberAtLeast(arrayField(matchingResult, "evidence", "search result evidence").length, 1, "search result includes evidence");

  const cardEvidenceCount = publicCards.flatMap((card) => arrayField(asRecord(card, "public card"), "evidence", "card evidence")).length;
  const claimEvidenceCount = arrayField(publicProfile, "claims", "profile claims").flatMap((claim) => arrayField(asRecord(claim, "claim"), "evidence", "claim evidence")).length;
  assertNumberAtLeast(cardEvidenceCount + claimEvidenceCount, 1, "profile evidence is retrievable");

  await prisma.$disconnect();

  const reconnectPrisma = new PrismaClient();
  try {
    await reconnectPrisma.$connect();
    const reconnectApp = createApp({
      store: createPrismaStore(reconnectPrisma as unknown as PrismaStoreClient),
      seedDemo: false
    });
    const persistedProfile = await requestJson(reconnectApp, `/api/people/${encodeURIComponent(handle)}`);
    assertEqual(asRecord(persistedProfile.person, "persisted person").handle, handle, "profile persists after Prisma reconnect");
    const persistedSearch = await requestJson(reconnectApp, `/api/search?q=${encodeURIComponent("product design DB runtime evidence")}`);
    assert(arrayField(persistedSearch, "results", "persisted search results").some((item) => asRecord(asRecord(item, "result").person, "person").handle === handle), "search finds profile after Prisma reconnect");
  } finally {
    await reconnectPrisma.person.deleteMany({ where: { handle } });
    await reconnectPrisma.$disconnect();
  }

  console.log(JSON.stringify({
    ok: true,
    handle,
    runId: generated.runId,
    cards: publicCards.length,
    searchResults: searchResults.length,
    verified: [
      "Prisma connection",
      "profile generation",
      "profile run summary",
      "manual note card",
      "card patch visibility/order",
      "hidden card public filtering",
      "DB-backed search",
      "evidence retrieval",
      "Prisma reconnect persistence"
    ]
  }, null, 2));
} catch (error) {
  try {
    await prisma.person.deleteMany({ where: { handle } });
  } catch {
    // Best-effort cleanup only; keep the original verification error visible.
  }
  throw error;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

async function requestJson(app: ReturnType<typeof createApp>, path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await app.request(path, init);
  const json = await response.json() as JsonRecord;
  if (!response.ok) {
    throw new Error(`Request ${path} failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function assert(value: boolean, message: string): asserts value {
  if (!value) {
    throw new Error(`DB runtime verification failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`DB runtime verification failed: ${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertNumberAtLeast(value: unknown, minimum: number, message: string) {
  if (typeof value !== "number" || value < minimum) {
    throw new Error(`DB runtime verification failed: ${message}. Expected number >= ${minimum}, got ${String(value)}.`);
  }
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`DB runtime verification failed: ${label} was not an object.`);
  }
  return value as JsonRecord;
}

function arrayField(record: JsonRecord | undefined, key: string, label: string): unknown[] {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    throw new Error(`DB runtime verification failed: ${label} was not an array.`);
  }
  return value;
}

function stringField(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`DB runtime verification failed: ${label} was not a non-empty string.`);
  }
  return value;
}
