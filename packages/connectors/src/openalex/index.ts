export type OpenAlexAuthor = {
  id: string;
  display_name: string;
  orcid?: string | null;
  last_known_institutions?: Array<{
    display_name?: string;
  }>;
  works_count?: number;
  cited_by_count?: number;
  summary_stats?: {
    h_index?: number;
  };
};

export type OpenAlexWork = {
  id: string;
  display_name: string;
  title?: string;
  doi?: string | null;
  publication_year?: number;
  cited_by_count?: number;
  primary_location?: {
    landing_page_url?: string | null;
  } | null;
  concepts?: Array<{ display_name: string; score?: number }>;
};

export type OpenAlexFetchOptions = {
  fetchImpl?: typeof fetch;
};

export function parseOpenAlexAuthorInput(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:openalex\.org\/)?(A\d+)$/i);

  if (!match?.[1]) {
    throw new Error("Input must be an OpenAlex author ID or author URL.");
  }

  return match[1].toUpperCase();
}

export async function fetchOpenAlexAuthor(input: string, options: OpenAlexFetchOptions = {}): Promise<OpenAlexAuthor> {
  const authorId = parseOpenAlexAuthorInput(input);
  const response = await (options.fetchImpl ?? fetch)(`https://api.openalex.org/authors/${authorId}`);

  if (!response.ok) {
    throw new Error(`OpenAlex author request failed with status ${response.status}.`);
  }

  return response.json() as Promise<OpenAlexAuthor>;
}

export async function searchOpenAlexAuthors(query: string, options: OpenAlexFetchOptions = {}): Promise<OpenAlexAuthor[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL("https://api.openalex.org/authors");
  url.searchParams.set("search", trimmed);
  url.searchParams.set("per-page", "5");

  const response = await (options.fetchImpl ?? fetch)(url);

  if (!response.ok) {
    throw new Error(`OpenAlex author search failed with status ${response.status}.`);
  }

  const body = await response.json() as { results?: OpenAlexAuthor[] };
  return body.results ?? [];
}

export async function fetchOpenAlexWorks(authorId: string, options: OpenAlexFetchOptions = {}): Promise<OpenAlexWork[]> {
  const id = parseOpenAlexAuthorInput(authorId);
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("filter", `authorships.author.id:https://openalex.org/${id}`);
  url.searchParams.set("sort", "cited_by_count:desc");
  url.searchParams.set("per-page", "25");

  const response = await (options.fetchImpl ?? fetch)(url);

  if (!response.ok) {
    throw new Error(`OpenAlex works request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as { results?: OpenAlexWork[] };
  return body.results ?? [];
}

export function normalizeOpenAlexAuthorToIdentitySource(author: OpenAlexAuthor) {
  return {
    type: "openalex",
    url: author.id,
    externalId: parseOpenAlexAuthorInput(author.id),
    rawJson: author
  };
}

export function normalizeOpenAlexWorksToArtifacts(works: OpenAlexWork[]) {
  return dedupeOpenAlexWorks(works).map((work) => ({
    type: "paper",
    title: work.title ?? work.display_name,
    description: buildDescription(work),
    url: work.primary_location?.landing_page_url ?? work.doi ?? work.id,
    metadata: {
      openAlexId: work.id,
      doi: work.doi,
      year: work.publication_year,
      citations: work.cited_by_count ?? 0,
      concepts: (work.concepts ?? []).slice(0, 8).map((concept) => concept.display_name)
    },
    evidenceRaw: work
  }));
}

function dedupeOpenAlexWorks(works: OpenAlexWork[]): OpenAlexWork[] {
  const byKey = new Map<string, OpenAlexWork>();
  for (const work of works) {
    const key = openAlexWorkKey(work);
    const existing = byKey.get(key);
    if (!existing || openAlexWorkRank(work) > openAlexWorkRank(existing)) {
      byKey.set(key, work);
    }
  }
  return [...byKey.values()];
}

function openAlexWorkKey(work: OpenAlexWork): string {
  const title = normalizeTitle(work.title ?? work.display_name);
  if (title) {
    return `title:${title}`;
  }
  const doi = work.doi?.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").trim();
  if (doi) {
    return `doi:${doi}`;
  }
  return `id:${work.id}`;
}

function openAlexWorkRank(work: OpenAlexWork): number {
  return (work.primary_location?.landing_page_url ? 1000 : 0) + (work.cited_by_count ?? 0);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\((?:preprint|version\s*\d+)\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function buildDescription(work: OpenAlexWork): string | undefined {
  const parts = [
    work.publication_year ? `Published ${work.publication_year}` : undefined,
    typeof work.cited_by_count === "number" ? `${work.cited_by_count} citations` : undefined
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("; ") : undefined;
}
