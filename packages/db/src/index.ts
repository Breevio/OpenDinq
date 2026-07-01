export { createPrismaStore, createPrismaStoreFromGeneratedClient } from "./prisma-store.js";
export type { PrismaStoreClient } from "./prisma-store.js";
export {
  getArtifactsForPerson,
  getPersonByHandle,
  listCardsForPerson,
  listPeople,
  saveCard,
  upsertArtifacts,
  upsertIdentitySource,
  upsertPerson
} from "./repositories/people.js";
export type {
  ArtifactInput,
  CardInput,
  IdentitySourceInput,
  PersonInput,
  PrismaRepositoryClient
} from "./repositories/types.js";
