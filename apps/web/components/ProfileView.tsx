"use client";

import { useEffect, useState } from "react";
import { apiRequest, type PersonProfile } from "../lib/api";
import { EvidenceDrawer } from "./EvidenceList";

export function ProfileView({ handle }: { handle: string }) {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    apiRequest<PersonProfile>(`/api/people/${encodeURIComponent(handle)}`)
      .then((loadedProfile) => {
        if (isActive) {
          setProfile(loadedProfile);
        }
      })
      .catch((caughtError) => {
        if (isActive) {
          setError(caughtError instanceof Error ? caughtError.message : "Profile failed to load.");
        }
      });

    return () => {
      isActive = false;
    };
  }, [handle]);

  if (error) {
    return <p className="status error">{error}</p>;
  }

  if (!profile) {
    return <p className="status">Loading profile...</p>;
  }

  const claims = visibleClaims(profile);

  return (
    <div className="profile-grid">
      <section className="profile-header">
        {profile.person.avatarUrl ? <img src={profile.person.avatarUrl} alt="" /> : null}
        <div>
          <p className="eyebrow">{profile.person.handle}</p>
          <h1>{profile.person.displayName}</h1>
          {profile.person.headline ? <p>{profile.person.headline}</p> : null}
          {topSkills(profile).length > 0 ? (
            <div className="skill-strip">
              {topSkills(profile).map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          ) : null}
          <div className="result-strip profile-meta">
            <span>{profile.person.publicStatus === "published" ? "Published profile" : "Draft profile"}</span>
            <span>{profile.artifacts.length} source artifact{profile.artifacts.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy profile link</button>
            {visibleSourceTypes(profile.sources).map((sourceType) => (
              <span key={sourceType}>{readableSourceType(sourceType)}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="cards-grid">
        {publicProfileCards(profile).map((card) => (
          <article className="profile-card" key={card.id ?? `${card.type}-${card.title}`}>
            <p className="eyebrow">{readableCardType(card.type)}</p>
            <h2>{card.title}</h2>
            <CardContent card={card} />
            <EvidenceDrawer evidence={card.evidence} />
          </article>
        ))}
        {publicProfileCards(profile).length === 0 ? <p className="status">No public cards yet.</p> : null}
      </section>

      {claims.length ? (
        <section className="claim-panel">
          <div className="section-title">
            <h2>Claims</h2>
            <span>{claims.length}</span>
          </div>
          {claims.slice(0, 12).map((claim, index) => (
            <div className="claim-row" key={claimKey(claim, index)}>
              <span>{readableClaimType(claim.type)}</span>
              <strong>{claim.text}</strong>
              <small>{claim.evidence.length} evidence item{claim.evidence.length === 1 ? "" : "s"}</small>
            </div>
          ))}
        </section>
      ) : <p className="status">No approved claims yet.</p>}

      <section className="source-panel">
        <div className="section-title">
          <h2>Sources</h2>
          <span>{profile.sources.length}</span>
        </div>
        {profile.sources.map((source) => (
          <a className="artifact-row" href={source.url} key={`${source.type}-${source.url}`}>
            <span>{readableSourceType(source.type)}</span>
            <strong>{source.url}</strong>
            <small>{source.externalId ? `ID ${source.externalId}` : "Linked source"}</small>
          </a>
        ))}
      </section>

      <section className="artifact-table">
        <div className="section-title">
          <h2>Artifacts</h2>
          <span>{profile.artifacts.length}</span>
        </div>
        {profile.artifacts.map((artifact) => (
          <a className="artifact-row" href={artifact.url} key={artifact.url ?? artifact.title}>
            <span>{readableArtifactType(artifact.type)}</span>
            <strong>{artifact.title}</strong>
            <small>{formatArtifactMeta(artifact.metadata)}</small>
          </a>
        ))}
        {profile.artifacts.length === 0 ? <p className="status">No artifacts yet.</p> : null}
      </section>
    </div>
  );
}

function topSkills(profile: PersonProfile): string[] {
  const claimSkills = visibleClaims(profile).filter((claim) => claim.type === "skill").map((claim) => claim.text);
  const cardSkills = publicProfileCards(profile).flatMap((card) => {
    const skills = card.dataJson?.skills;
    return Array.isArray(skills) ? skills.filter((skill): skill is string => typeof skill === "string") : [];
  });
  return [...new Set([...claimSkills, ...cardSkills])].slice(0, 8);
}

function visibleClaims(profile: PersonProfile): NonNullable<PersonProfile["claims"]> {
  const seenClaims = new Set<string>();
  return (profile.claims ?? [])
    .filter((claim): claim is NonNullable<PersonProfile["claims"]>[number] => Boolean(
      claim
      && typeof claim.type === "string"
      && typeof claim.text === "string"
      && Array.isArray(claim.evidence)
    ))
    .filter((claim) => {
      const identity = `${claim.type}:${claim.text.toLowerCase().trim()}`;
      if (seenClaims.has(identity)) {
        return false;
      }
      seenClaims.add(identity);
      return true;
    });
}

function claimKey(claim: NonNullable<PersonProfile["claims"]>[number], index: number) {
  return `${claim.id ?? `${claim.type}-${claim.text}`}-${index}`;
}

function CardContent({ card }: { card: PersonProfile["cards"][number] }) {
  const blocks = cardBlocks(card);

  return (
    <div className="card-content">
      {blocks.map((block, index) => {
        if (typeof block === "string" && block.startsWith("heading:")) {
          return <h3 key={index}>{block.slice("heading:".length)}</h3>;
        }
        if (Array.isArray(block)) {
          return (
            <ul key={index}>
              {block.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

function cardBlocks(card: PersonProfile["cards"][number]): Array<string | string[]> {
  const cleaned = stripInlineMarkdown(card.contentMd)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => expandInlineSeries(block, card.title));

  const filtered = cleaned
    .map((block) => Array.isArray(block) ? block.map(cleanCardLine).filter(Boolean) : cleanCardLine(block))
    .filter((block): block is string | string[] => Array.isArray(block) ? block.length > 0 : Boolean(block))
    .filter((block) => {
      if (Array.isArray(block)) {
        return true;
      }
      const normalized = normalizeBlockLabel(block);
      if (!normalized) {
        return false;
      }
      return normalized !== normalizeBlockLabel(card.title)
        && normalized !== normalizeBlockLabel(`${card.title} ${readableCardType(card.type)}`)
        && normalized !== normalizeBlockLabel(`${card.title} ${card.type}`);
    });

  if (filtered.length === 0) {
    return [];
  }
  return filtered;
}

function expandInlineSeries(block: string, cardTitle: string): Array<string | string[]> {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const listItems = lines.filter((line) => line.startsWith("- "));
  if (listItems.length > 0 && listItems.length === lines.length) {
    return [listItems.map((item) => item.slice(2).trim())];
  }

  const compact = block.replace(/\s+/g, " ").trim();
  const normalizedTitle = normalizeBlockLabel(cardTitle);
  const prefixedSeries = compact.match(/^([^:]+?)\s*-\s+(.+)$/);
  if (prefixedSeries) {
    const label = prefixedSeries[1]?.trim() ?? "";
    const rest = prefixedSeries[2]?.trim() ?? "";
    const normalizedLabel = normalizeBlockLabel(label);
    if (rest && normalizedLabel && normalizedLabel !== normalizedTitle) {
      return [[...rest.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean)]];
    }
  }

  return lines.map((line) => {
    if (line.startsWith("# ")) {
      return `heading:${line.slice(2).trim()}`;
    }
    if (line.startsWith("## ")) {
      return `heading:${line.slice(3).trim()}`;
    }
    return line;
  });
}

function cleanCardLine(value: string) {
  const withoutHeading = value.replace(/^heading:/, "").trim();
  const withoutLead = withoutHeading
    .replace(/^(profile|skills|selected works|timeline)\s*[:\-]\s*/i, "")
    .replace(/\((?:\d+% confidence|confidence:[^)]+|evidence:[^)]+)\)/gi, "")
    .replace(/,\s*evidence:\s*.+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return withoutLead.replace(/^[-:]\s*/, "").trim();
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/^#+\s+/gm, "")
    .replace(/^-+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

function normalizeBlockLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatArtifactMeta(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return "";
  }

  const language = typeof metadata.language === "string" ? metadata.language : undefined;
  const stars = typeof metadata.stars === "number" ? `${metadata.stars} stars` : undefined;
  return [language, stars].filter(Boolean).join(" / ");
}

function visibleSourceTypes(sources: PersonProfile["sources"]): string[] {
  return [...new Set(sources.map((source) => source.type))].slice(0, 4);
}

function readableSourceType(value: string) {
  switch (value) {
    case "github":
      return "GitHub";
    case "website":
      return "Website";
    case "openalex":
      return "OpenAlex";
    case "orcid":
      return "ORCID";
    case "arxiv":
      return "arXiv";
    case "manual":
      return "Manual source";
    default:
      return value.replace(/_/g, " ");
  }
}

function readableCardType(value: string) {
  switch (value) {
    case "summary":
      return "Profile";
    case "skills":
      return "Skills";
    case "works":
      return "Selected works";
    case "timeline":
      return "Timeline";
    default:
      return value.replace(/_/g, " ");
  }
}

function readableArtifactType(value: string) {
  switch (value) {
    case "repo":
      return "Repository";
    case "paper":
      return "Paper";
    case "project":
      return "Project";
    case "post":
      return "Post";
    case "website":
      return "Website";
    case "note":
      return "Note";
    default:
      return value.replace(/_/g, " ");
  }
}

function readableClaimType(value: string) {
  switch (value) {
    case "research_area":
      return "Research area";
    default:
      return value.replace(/_/g, " ");
  }
}

export function publicProfileCards(profile: Pick<PersonProfile, "cards">) {
  return profile.cards.filter((card) => card.visibility === undefined || card.visibility === "public");
}
