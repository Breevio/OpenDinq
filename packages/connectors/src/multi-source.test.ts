import { describe, expect, it } from "vitest";
import {
  fetchArxivPaper,
  searchArxivPapers,
  searchOpenAlexAuthors,
  searchOrcidRecords,
  fetchWebsiteMetadata,
  normalizeArxivPaperToArtifact,
  normalizeOpenAlexAuthorToIdentitySource,
  normalizeOpenAlexWorksToArtifacts,
  normalizeOrcidRecordToArtifacts,
  normalizeOrcidRecordToIdentitySource,
  normalizeWebsiteToArtifact,
  parseArxivId,
  parseOpenAlexAuthorInput,
  parseOrcidId
} from "./index.js";

describe("website connector", () => {
  it("extracts metadata and normalizes it to a website artifact", async () => {
    const metadata = await fetchWebsiteMetadata("example.com", {
      fetchImpl: async () =>
        new Response(`
          <html>
            <head>
              <title>Fallback title</title>
              <meta property="og:title" content="Example Builder" />
              <meta name="description" content="Public portfolio and project notes." />
            </head>
          </html>
        `)
    });

    expect(normalizeWebsiteToArtifact(metadata)).toMatchObject({
      type: "website",
      title: "Example Builder",
      description: "Public portfolio and project notes.",
      url: "https://example.com/"
    });
  });
});

describe("OpenAlex connector", () => {
  it("parses author IDs and normalizes works", () => {
    expect(parseOpenAlexAuthorInput("https://openalex.org/A123456789")).toBe("A123456789");
    expect(normalizeOpenAlexAuthorToIdentitySource({ id: "https://openalex.org/A123456789", display_name: "Ada" })).toMatchObject({
      type: "openalex",
      externalId: "A123456789"
    });
    expect(
      normalizeOpenAlexWorksToArtifacts([
        {
          id: "https://openalex.org/W1",
          display_name: "Agent systems paper",
          publication_year: 2026,
          cited_by_count: 42,
          primary_location: { landing_page_url: "https://doi.org/10.1/example" },
          concepts: [{ display_name: "Artificial intelligence" }]
        }
      ])
    ).toEqual([
      expect.objectContaining({
        type: "paper",
        title: "Agent systems paper",
        metadata: expect.objectContaining({
          citations: 42,
          concepts: ["Artificial intelligence"]
        })
      })
    ]);
  });

  it("searches OpenAlex authors by name", async () => {
    const authors = await searchOpenAlexAuthors("Jiajun Wu", {
      fetchImpl: async (url) => {
        expect(String(url)).toContain("api.openalex.org/authors");
        expect(String(url)).toContain("search=Jiajun+Wu");
        return Response.json({
          results: [
            {
              id: "https://openalex.org/A5018878364",
              display_name: "Jiajun Wu",
              works_count: 120,
              cited_by_count: 9000
            }
          ]
        });
      }
    });

    expect(authors[0]).toMatchObject({
      id: "https://openalex.org/A5018878364",
      display_name: "Jiajun Wu"
    });
  });
});

describe("arXiv connector", () => {
  it("parses arXiv IDs and Atom responses", async () => {
    expect(parseArxivId("https://arxiv.org/abs/2601.01234v2")).toBe("2601.01234v2");

    const paper = await fetchArxivPaper("2601.01234", {
      fetchImpl: async () =>
        new Response(`
          <feed>
            <entry>
              <id>https://arxiv.org/abs/2601.01234</id>
              <title>Agent Search Systems</title>
              <summary>Evidence-backed people search.</summary>
              <published>2026-01-02T00:00:00Z</published>
              <updated>2026-01-03T00:00:00Z</updated>
              <author><name>Ethan Shi</name></author>
              <category term="cs.AI" />
            </entry>
          </feed>
        `)
    });

    expect(normalizeArxivPaperToArtifact(paper)).toMatchObject({
      type: "paper",
      title: "Agent Search Systems",
      metadata: expect.objectContaining({
        arxivId: "2601.01234",
        categories: ["cs.AI"]
      })
    });
  });

  it("searches arXiv papers by author-style query", async () => {
    const papers = await searchArxivPapers("Jiajun Wu", {
      fetchImpl: async (url) => {
        expect(String(url)).toContain("export.arxiv.org/api/query");
        expect(String(url)).toContain("search_query=au%3A%22Jiajun+Wu%22");
        return new Response(`
          <feed>
            <entry>
              <id>https://arxiv.org/abs/2601.01234</id>
              <title>3D Scene Understanding</title>
              <summary>Scene understanding paper.</summary>
              <author><name>Jiajun Wu</name></author>
              <category term="cs.CV" />
            </entry>
          </feed>
        `);
      }
    });

    expect(papers[0]).toMatchObject({
      id: "2601.01234",
      title: "3D Scene Understanding",
      authors: ["Jiajun Wu"]
    });
  });
});

describe("ORCID connector", () => {
  it("parses ORCID IDs and normalizes record works", () => {
    expect(parseOrcidId("https://orcid.org/0000-0002-1825-0097")).toBe("0000-0002-1825-0097");

    const record = {
      "orcid-identifier": {
        path: "0000-0002-1825-0097",
        uri: "https://orcid.org/0000-0002-1825-0097"
      },
      "activities-summary": {
        works: {
          group: [
            {
              "work-summary": [
                {
                  title: { title: { value: "Open profile indexing" } },
                  "publication-date": { year: { value: "2026" } },
                  url: { value: "https://example.com/paper" }
                }
              ]
            }
          ]
        }
      }
    };

    expect(normalizeOrcidRecordToIdentitySource(record)).toMatchObject({
      type: "orcid",
      externalId: "0000-0002-1825-0097"
    });
    expect(normalizeOrcidRecordToArtifacts(record)).toEqual([
      expect.objectContaining({
        type: "paper",
        title: "Open profile indexing",
        url: "https://example.com/paper"
      })
    ]);
  });

  it("searches ORCID public records", async () => {
    const records = await searchOrcidRecords("Jiajun Wu", {
      fetchImpl: async (url) => {
        expect(String(url)).toContain("pub.orcid.org/v3.0/expanded-search/");
        expect(String(url)).toContain("q=Jiajun+Wu");
        return Response.json({
          "expanded-result": [
            {
              "orcid-id": "0000-0002-1825-0097",
              "given-names": "Jiajun",
              "family-names": "Wu",
              institution: ["Stanford University"]
            }
          ]
        });
      }
    });

    expect(records[0]).toMatchObject({
      "orcid-id": "0000-0002-1825-0097",
      "given-names": "Jiajun"
    });
  });
});
