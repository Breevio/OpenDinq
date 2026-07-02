import { createTimeoutFetchImpl } from "../fetch-timeout.js";

export type WebsiteMetadata = {
  url: string;
  title: string;
  description?: string;
  image?: string;
};

export type WebsiteFetchOptions = {
  fetchImpl?: typeof fetch;
};

export async function fetchWebsiteMetadata(inputUrl: string, options: WebsiteFetchOptions = {}): Promise<WebsiteMetadata> {
  const url = normalizeHttpUrl(inputUrl);
  const fetchImpl = createTimeoutFetchImpl(options.fetchImpl ?? fetch);
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Website request failed with status ${response.status}.`);
  }

  const html = await response.text();
  const title = extractMeta(html, "og:title") ?? extractTitle(html) ?? new URL(url).hostname;

  return {
    url,
    title: cleanText(title),
    description: cleanOptional(extractMeta(html, "og:description") ?? extractMetaName(html, "description")),
    image: absolutizeUrl(cleanOptional(extractMeta(html, "og:image")), url)
  };
}

export function normalizeWebsiteToArtifact(metadata: WebsiteMetadata) {
  return {
    type: "website",
    title: metadata.title,
    description: metadata.description,
    url: metadata.url,
    metadata: {
      image: metadata.image
    },
    evidenceRaw: metadata
  };
}

function normalizeHttpUrl(input: string): string {
  const trimmed = input.trim();
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Website URL must use http or https.");
  }

  return url.toString();
}

function extractTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
}

function extractMeta(html: string, property: string): string | undefined {
  const pattern = new RegExp(`<meta[^>]+property=["']${escapeRegExp(property)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(pattern)?.[1];
}

function extractMetaName(html: string, name: string): string | undefined {
  const pattern = new RegExp(`<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(pattern)?.[1];
}

function absolutizeUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return new URL(value, baseUrl).toString();
}

function cleanOptional(value: string | undefined): string | undefined {
  return value ? cleanText(value) : undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
