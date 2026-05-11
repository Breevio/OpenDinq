export type OrcidRecord = {
  "orcid-identifier": {
    path: string;
    uri: string;
  };
  person?: {
    name?: {
      "given-names"?: { value?: string };
      "family-name"?: { value?: string };
    };
  };
  "activities-summary"?: {
    works?: {
      group?: OrcidWorkGroup[];
    };
  };
};

export type OrcidSearchResult = {
  "expanded-result"?: Array<{
    "orcid-id"?: string;
    "given-names"?: string;
    "family-names"?: string;
    "credit-name"?: string;
    institution?: string[];
    "other-name"?: string[];
  }>;
};

export type OrcidWorkGroup = {
  "work-summary"?: Array<{
    title?: {
      title?: { value?: string };
    };
    "publication-date"?: {
      year?: { value?: string };
    };
    url?: {
      value?: string;
    };
    "external-ids"?: {
      "external-id"?: Array<{
        "external-id-type"?: string;
        "external-id-value"?: string;
        "external-id-url"?: { value?: string };
      }>;
    };
  }>;
};

export type OrcidFetchOptions = {
  fetchImpl?: typeof fetch;
};

export function parseOrcidId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/i);

  if (!match?.[1]) {
    throw new Error("Input must be an ORCID iD or ORCID profile URL.");
  }

  return match[1].toUpperCase();
}

export async function fetchOrcidRecord(input: string, options: OrcidFetchOptions = {}): Promise<OrcidRecord> {
  const id = parseOrcidId(input);
  const response = await (options.fetchImpl ?? fetch)(`https://pub.orcid.org/v3.0/${id}/record`, {
    headers: {
      accept: "application/vnd.orcid+json"
    }
  });

  if (!response.ok) {
    throw new Error(`ORCID request failed with status ${response.status}.`);
  }

  return response.json() as Promise<OrcidRecord>;
}

export async function searchOrcidRecords(query: string, options: OrcidFetchOptions = {}): Promise<NonNullable<OrcidSearchResult["expanded-result"]>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL("https://pub.orcid.org/v3.0/expanded-search/");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("rows", "5");
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: {
      accept: "application/vnd.orcid+json"
    }
  });

  if (!response.ok) {
    throw new Error(`ORCID search failed with status ${response.status}.`);
  }

  const body = await response.json() as OrcidSearchResult;
  return body["expanded-result"] ?? [];
}

export function normalizeOrcidRecordToIdentitySource(record: OrcidRecord) {
  return {
    type: "orcid",
    url: record["orcid-identifier"].uri,
    externalId: record["orcid-identifier"].path,
    rawJson: record
  };
}

export function normalizeOrcidRecordToArtifacts(record: OrcidRecord) {
  return (record["activities-summary"]?.works?.group ?? [])
    .map((group) => group["work-summary"]?.[0])
    .filter((summary): summary is NonNullable<OrcidWorkGroup["work-summary"]>[number] => Boolean(summary?.title?.title?.value))
    .map((summary) => ({
      type: "paper",
      title: summary.title?.title?.value ?? "Untitled ORCID work",
      description: summary["publication-date"]?.year?.value ? `Published ${summary["publication-date"].year.value}` : undefined,
      url: summary.url?.value ?? findExternalUrl(summary) ?? undefined,
      metadata: {
        year: summary["publication-date"]?.year?.value,
        externalIds: summary["external-ids"]?.["external-id"] ?? []
      },
      evidenceRaw: summary
    }));
}

function findExternalUrl(summary: NonNullable<OrcidWorkGroup["work-summary"]>[number]): string | undefined {
  return summary["external-ids"]?.["external-id"]?.find((externalId) => externalId["external-id-url"]?.value)?.["external-id-url"]?.value;
}
