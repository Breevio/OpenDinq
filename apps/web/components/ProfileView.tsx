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
        </div>
      </section>

      <section className="cards-grid">
        {profile.cards.map((card) => (
          <article className="profile-card" key={`${card.type}-${card.title}`}>
            <p className="eyebrow">{card.type}</p>
            <h2>{card.title}</h2>
            <pre>{card.contentMd}</pre>
            <div className="evidence-list">
              {card.evidence.map((evidence) => (
                <a href={evidence.url} key={`${card.title}-${evidence.id}`}>
                  {evidence.title}
                </a>
              ))}
            </div>
          </article>
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

function formatArtifactMeta(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return "";
  }

  const language = typeof metadata.language === "string" ? metadata.language : undefined;
  const stars = typeof metadata.stars === "number" ? `${metadata.stars} stars` : undefined;
  return [language, stars].filter(Boolean).join(" / ");
}

