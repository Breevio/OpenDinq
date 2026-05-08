export const DB_SCHEMA_STATUS = "implemented-for-milestone-4";

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
