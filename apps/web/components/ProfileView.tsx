"use client";

import { useEffect, useState } from "react";
import { apiRequest, type PersonProfile } from "../lib/api";

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
    return <p className="status">Loading profile evidence...</p>;
  }

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
            <span>{profileCompleteness(profile)}% complete</span>
            {profile.sources.slice(0, 5).map((source) => (
              <span key={`${source.type}-${source.url}`}>{source.type}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="cards-grid">
        {profile.cards.filter((card) => card.visibility !== "hidden").map((card) => (
          <article className="profile-card" key={card.id ?? `${card.type}-${card.title}`}>
            <p className="eyebrow">{card.type}</p>
            <h2>{card.title}</h2>
            <pre>{card.contentMd}</pre>
            {typeof card.confidence === "number" ? <small>{Math.round(card.confidence * 100)}% confidence</small> : null}
            <details className="evidence-drawer">
              <summary>Evidence ({card.evidence.length})</summary>
              <div className="evidence-list">
                {card.evidence.map((evidence, index) => (
                  evidence.url ? (
                    <a href={evidence.url} key={`${card.title}-${evidence.id}-${index}`}>
                      {evidence.title}
                    </a>
                  ) : (
                    <span key={`${card.title}-${evidence.id}-${index}`}>{evidence.title}</span>
                  )
                ))}
              </div>
            </details>
          </article>
        ))}
      </section>

      {profile.claims?.length ? (
        <section className="claim-panel">
          <div className="section-title">
            <h2>Claims</h2>
            <span>{profile.claims.length}</span>
          </div>
          {profile.claims.slice(0, 12).map((claim) => (
            <div className="claim-row" key={claim.id ?? claim.text}>
              <span>{claim.type}</span>
              <strong>{claim.text}</strong>
              <small>{Math.round(claim.confidence * 100)}%</small>
            </div>
          ))}
        </section>
      ) : null}

      <section className="source-panel">
        <div className="section-title">
          <h2>Sources</h2>
          <span>{profile.sources.length}</span>
        </div>
        {profile.sources.map((source) => (
          <a className="artifact-row" href={source.url} key={`${source.type}-${source.url}`}>
            <span>{source.type}</span>
            <strong>{source.url}</strong>
            <small>{source.externalId ?? ""}</small>
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
            <span>{artifact.type}</span>
            <strong>{artifact.title}</strong>
            <small>{formatArtifactMeta(artifact.metadata)}</small>
          </a>
        ))}
      </section>
    </div>
  );
}

function topSkills(profile: PersonProfile): string[] {
  const claimSkills = (profile.claims ?? []).filter((claim) => claim.type === "skill").map((claim) => claim.text);
  const cardSkills = profile.cards.flatMap((card) => {
    const skills = card.dataJson?.skills;
    return Array.isArray(skills) ? skills.filter((skill): skill is string => typeof skill === "string") : [];
  });
  return [...new Set([...claimSkills, ...cardSkills])].slice(0, 8);
}

function formatArtifactMeta(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return "";
  }

  const language = typeof metadata.language === "string" ? metadata.language : undefined;
  const stars = typeof metadata.stars === "number" ? `${metadata.stars} stars` : undefined;
  return [language, stars].filter(Boolean).join(" / ");
}

function profileCompleteness(profile: PersonProfile): number {
  const sourceScore = Math.min(1, profile.sources.length / 3) * 25;
  const claimScore = Math.min(1, (profile.claims?.length ?? 0) / 8) * 25;
  const cardScore = Math.min(1, profile.cards.filter((card) => card.visibility !== "hidden").length / 4) * 25;
  const artifactScore = Math.min(1, profile.artifacts.length / 6) * 25;
  return Math.round(sourceScore + claimScore + cardScore + artifactScore);
}
