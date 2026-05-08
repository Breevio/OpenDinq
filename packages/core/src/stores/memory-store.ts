import type {
  CardRecord,
  OpenDinqStore,
  PersonProfileRecord,
  ProfileClaimRecord,
  ProfileGenerationRunRecord,
  ProfileSourceRecord
} from "../store.js";

export function createMemoryStore(initialProfiles: PersonProfileRecord[] = []): OpenDinqStore {
  const profiles = new Map(initialProfiles.map((profile) => [profile.person.handle, profile]));
  const runs = new Map<string, ProfileGenerationRunRecord>();
  const sourcesByRun = new Map<string, ProfileSourceRecord[]>();
  const claimsByHandle = new Map<string, ProfileClaimRecord[]>();

  return {
    async upsertProfile(record) {
      const existing = profiles.get(record.person.handle);
      const claims = record.claims ?? existing?.claims ?? claimsByHandle.get(record.person.handle);
      const merged = claims ? { ...record, claims } : record;
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
      return profiles.get(handle)?.cards;
    },
    async saveCard(handle, card: CardRecord) {
      const profile = profiles.get(handle);
      if (!profile) {
        return undefined;
      }

      profile.cards.push(card);
      return card;
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
