import type { CardRecord, OpenDinqStore, PersonProfileRecord } from "../store.js";

export function createMemoryStore(initialProfiles: PersonProfileRecord[] = []): OpenDinqStore {
  const profiles = new Map(initialProfiles.map((profile) => [profile.person.handle, profile]));

  return {
    async upsertProfile(record) {
      profiles.set(record.person.handle, record);
      return record;
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
    }
  };
}
