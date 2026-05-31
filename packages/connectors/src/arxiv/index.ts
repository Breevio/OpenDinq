export type ArxivPaper = {
  id: string;
  title: string;
  summary: string;
  url: string;
  published?: string;
  updated?: string;
  authors: string[];
  categories: string[];
};

export type ArxivFetchOptions = {
  fetchImpl?: typeof fetch;
};

export function parseArxivId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:arxiv\.org\/abs\/)?([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z-]+\/[0-9]{7}(?:v\d+)?)$/i);

  if (!match?.[1]) {
    throw new Error("Input must be an arXiv ID or arXiv abstract URL.");
  }

  return match[1];
}

export async function fetchArxivPaper(input: string, options: ArxivFetchOptions = {}): Promise<ArxivPaper> {
  const id = parseArxivId(input);
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("id_list", id);

  const response = await (options.fetchImpl ?? fetch)(url);

  if (!response.ok) {
    throw new Error(`arXiv request failed with status ${response.status}.`);
  }

  return parseArxivAtom(await response.text(), id);
}

export async function searchArxivPapers(query: string, options: ArxivFetchOptions = {}): Promise<ArxivPaper[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", arxivSearchQuery(trimmed));
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", "5");
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  const response = await (options.fetchImpl ?? fetch)(url);

  if (!response.ok) {
    throw new Error(`arXiv search failed with status ${response.status}.`);
  }

  return parseArxivSearchAtom(await response.text());
}

export function normalizeArxivPaperToArtifact(paper: ArxivPaper) {
  return {
    type: "paper",
    title: paper.title,
    description: paper.summary,
    url: paper.url,
    metadata: {
      arxivId: paper.id,
      authors: paper.authors,
      categories: paper.categories,
      publishedAt: paper.published,
      updatedAt: paper.updated
    },
    evidenceRaw: paper
  };
}

function parseArxivAtom(xml: string, requestedId: string): ArxivPaper {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) {
    throw new Error(`arXiv paper was not found: ${requestedId}.`);
  }

  const idUrl = readTag(entry, "id") ?? `https://arxiv.org/abs/${requestedId}`;

  return {
    id: idUrl.split("/").at(-1) ?? requestedId,
    title: cleanText(readTag(entry, "title") ?? requestedId),
    summary: cleanText(readTag(entry, "summary") ?? ""),
    url: idUrl,
    published: readTag(entry, "published"),
    updated: readTag(entry, "updated"),
    authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)].map((match) => cleanText(match[1] ?? "")),
    categories: [...entry.matchAll(/<category[^>]+term=["']([^"']+)["'][^>]*\/>/gi)].map((match) => match[1] ?? "")
  };
}

function parseArxivSearchAtom(xml: string): ArxivPaper[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => parseArxivEntry(match[1] ?? ""));
}

function parseArxivEntry(entry: string): ArxivPaper {
  const idUrl = readTag(entry, "id") ?? "";

  return {
    id: idUrl.split("/").at(-1) ?? idUrl,
    title: cleanText(readTag(entry, "title") ?? "Untitled arXiv paper"),
    summary: cleanText(readTag(entry, "summary") ?? ""),
    url: idUrl,
    published: readTag(entry, "published"),
    updated: readTag(entry, "updated"),
    authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)].map((match) => cleanText(match[1] ?? "")),
    categories: [...entry.matchAll(/<category[^>]+term=["']([^"']+)["'][^>]*\/>/gi)].map((match) => match[1] ?? "")
  };
}

function arxivSearchQuery(query: string): string {
  return personLikeInput(query) ? `au:"${query.replaceAll("\"", "")}"` : `all:"${query.replaceAll("\"", "")}"`;
}

function personLikeInput(input: string): boolean {
  return /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(input.trim());
}

function readTag(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1];
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
