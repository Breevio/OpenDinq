import type {
  CardRecord,
  CardPatchRecord,
  OpenDinqStore,
  PersonProfileRecord,
  ProfileClaimRecord,
  ProfileGenerationRunRecord,
  ProfileSourceRecord
} from "../store.js";

export function createMemoryStore(initialProfiles: PersonProfileRecord[] = []): OpenDinqStore {
  const profiles = new Map(initialProfiles.map((profile) => [profile.person.handle, normalizeProfile(profile)]));
  const runs = new Map<string, ProfileGenerationRunRecord>();
  const sourcesByRun = new Map<string, ProfileSourceRecord[]>();
  const claimsByHandle = new Map<string, ProfileClaimRecord[]>();

  return {
    async upsertProfile(record) {
      const existing = profiles.get(record.person.handle);
      const claims = record.claims ?? existing?.claims ?? claimsByHandle.get(record.person.handle);
      const merged = normalizeProfile(claims ? { ...record, claims } : record);
      profiles.set(record.person.handle, merged);
      return merged;
    },
    async getProfile(handle) {
      return profiles.get(handle);
    },
    async listProfiles() {
      return [...profiles.values()].sort((left, right) =>
        left.person.handle.localeCompare(right.person.handle)
      );
    },
    async listCards(handle) {
      return sortedCards(profiles.get(handle)?.cards);
    },
    async saveCard(handle, card: CardRecord) {
      const profile = profiles.get(handle);
      if (!profile) {
        return undefined;
      }

      const saved = normalizeCard(handle, card, nextCardOrder(profile.cards));
      profile.cards.push(saved);
      profile.cards = sortedCards(profile.cards) ?? [];
      return saved;
    },
    async updateCard(cardId: string, patch: CardPatchRecord) {
      for (const profile of profiles.values()) {
        const index = profile.cards.findIndex((card) => card.id === cardId);
        if (index < 0) {
          continue;
        }

        const existing = profile.cards[index];
        if (!existing) {
          continue;
        }
        const updated = normalizeCard(profile.person.handle, {
          ...existing,
          ...compactCardPatch(patch),
          updatedAt: new Date().toISOString()
        }, existing.order);
        profile.cards[index] = updated;
        profile.cards = sortedCards(profile.cards) ?? [];
        return updated;
      }

      return undefined;
    },
    async createProfileRun(run) {
      runs.set(run.id, run);
      return run;
    },
    async updateProfileRun(runId, patch) {
      const run = runs.get(runId);
      if (!run) {
        return undefined;
      }

      const updated = { ...run, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
      runs.set(runId, updated);
      return updated;
    },
    async getProfileRun(runId) {
      return runs.get(runId);
    },
    async saveProfileSources(handle, sources) {
      const profile = profiles.get(handle);
      if (!profile) {
        return [];
      }

      const saved = sources.map((source, index) => ({
        id: source.id ?? `${source.type}-${handle}-${index}`,
        personId: handle,
        ...source
      }));
      for (const source of saved) {
        if (source.runId) {
          sourcesByRun.set(source.runId, [...(sourcesByRun.get(source.runId) ?? []), source]);
        }
      }

      return saved;
    },
    async listProfileSources(runId) {
      return sourcesByRun.get(runId) ?? [];
    },
    async saveProfileClaims(handle, claims) {
      const saved = claims.map((claim, index) => ({
        id: claim.id ?? `claim-${handle}-${index}`,
        personId: handle,
        ...claim
      }));
      claimsByHandle.set(handle, saved);
      const profile = profiles.get(handle);
      if (profile) {
        profile.claims = saved;
      }

      return saved;
    },
    async listProfileClaims(handle) {
      return claimsByHandle.get(handle) ?? profiles.get(handle)?.claims ?? [];
    }
  };
}

function normalizeProfile(profile: PersonProfileRecord): PersonProfileRecord {
  return {
    ...profile,
    cards: sortedCards(profile.cards.map((card, index) => normalizeCard(profile.person.handle, card, index + 1))) ?? []
  };
}

function normalizeCard(handle: string, card: CardRecord, fallbackOrder = 0): CardRecord {
  const now = new Date().toISOString();
  return {
    ...card,
    id: card.id ?? `card-${handle}-${slugify(card.type)}-${slugify(card.title)}`,
    personId: card.personId ?? handle,
    visibility: card.visibility ?? "public",
    order: card.order ?? fallbackOrder,
    createdAt: card.createdAt ?? now,
    updatedAt: card.updatedAt ?? card.createdAt ?? now
  };
}

function sortedCards(cards: CardRecord[] | undefined): CardRecord[] | undefined {
  return cards?.toSorted((left, right) =>
    (left.order ?? 0) - (right.order ?? 0) || left.type.localeCompare(right.type) || left.title.localeCompare(right.title)
  );
}

function nextCardOrder(cards: CardRecord[]): number {
  return Math.max(0, ...cards.map((card) => card.order ?? 0)) + 10;
}

function compactCardPatch(patch: CardPatchRecord): CardPatchRecord {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as CardPatchRecord;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "card";
}
