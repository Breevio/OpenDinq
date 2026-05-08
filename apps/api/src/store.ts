import type { GeneratedCard } from "@opendinq/cards";
import type { SearchArtifact, SearchPerson } from "@opendinq/search";

export type ApiIdentitySource = {
  type: string;
  url: string;
  externalId?: string;
  rawJson?: unknown;
};

export type ApiPersonRecord = {
  person: SearchPerson;
  sources: ApiIdentitySource[];
  artifacts: SearchArtifact[];
  cards: GeneratedCard[];
};

export type ApiStore = {
  upsertProfile(record: ApiPersonRecord): ApiPersonRecord;
  getProfile(handle: string): ApiPersonRecord | undefined;
  listProfiles(): ApiPersonRecord[];
  listCards(handle: string): GeneratedCard[] | undefined;
  saveCard(handle: string, card: GeneratedCard): GeneratedCard | undefined;
};

export function createMemoryStore(initialProfiles: ApiPersonRecord[] = []): ApiStore {
  const profiles = new Map(initialProfiles.map((profile) => [profile.person.handle, profile]));

  return {
    upsertProfile(record) {
      profiles.set(record.person.handle, record);
      return record;
    },
    getProfile(handle) {
      return profiles.get(handle);
    },
    listProfiles() {
      return [...profiles.values()].sort((left, right) =>
        left.person.handle.localeCompare(right.person.handle)
      );
    },
    listCards(handle) {
      return profiles.get(handle)?.cards;
    },
    saveCard(handle, card) {
      const profile = profiles.get(handle);
      if (!profile) {
        return undefined;
      }

      profile.cards.push(card);
      return card;
    }
  };
}
