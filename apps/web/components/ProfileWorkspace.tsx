"use client";

import { useEffect, useState } from "react";
import { apiRequest, type PersonProfile, type ProfileCard, type ProfileWorkspace as WorkspaceData } from "../lib/api";
import { EvidenceDrawer } from "./EvidenceList";

type CardVisibility = "public" | "private" | "hidden";

export function ProfileWorkspace({ handle }: { handle: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setWorkspace(await apiRequest<WorkspaceData>(`/api/people/${encodeURIComponent(handle)}/workspace`));
  }

  useEffect(() => {
    load().catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Workspace failed to load."));
  }, [handle]);

  async function patchClaim(claimId: string, patch: Record<string, unknown>) {
    await apiRequest(`/api/claims/${encodeURIComponent(claimId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await load();
  }

  async function patchCard(cardId: string, patch: Record<string, unknown>) {
    await apiRequest(`/api/cards/${encodeURIComponent(cardId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await load();
  }

  async function regenerateCard(cardId: string) {
    await apiRequest(`/api/cards/${encodeURIComponent(cardId)}/regenerate`, { method: "POST" });
    await load();
  }

  async function createNote(form: FormData) {
    await apiRequest(`/api/people/${encodeURIComponent(handle)}/cards/manual-note`, {
      method: "POST",
      body: JSON.stringify({
        title: String(form.get("title") ?? "Manual note"),
        contentMd: String(form.get("contentMd") ?? "")
      })
    });
    await load();
  }

  async function publish(publicStatus: "draft" | "published") {
    await apiRequest(`/api/people/${encodeURIComponent(handle)}/publish`, {
      method: "PATCH",
      body: JSON.stringify({ publicStatus })
    });
    await load();
  }

  if (error) {
    return <p className="status error">{error}</p>;
  }

  if (!workspace) {
    return <p className="status">Loading workspace...</p>;
  }

  const { profile, readiness } = workspace;
  const userProvidedClaims = (profile.claims ?? []).filter((claim) => claim.status === "pending" || claim.evidence.some((item) => item.reason.toLowerCase().includes("user-provided")));
  const evidenceBackedClaims = (profile.claims ?? []).filter((claim) => !userProvidedClaims.includes(claim));
  const sourceWarnings = workspace.profileSources.flatMap((source) => source.warnings ?? []);

  return (
    <div className="workspace-grid">
      <section className="profile-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>{profile.person.displayName}</h1>
          <p>{profile.person.headline ?? "No headline yet."}</p>
          <div className="result-strip profile-meta">
            <span>{profile.person.publicStatus === "published" ? "Published profile" : "Draft profile"}</span>
            <a href={`/u/${profile.person.handle}`}>Public profile</a>
            <a href={`/discover?q=${encodeURIComponent(workspace.discoverQuery)}`}>Search related profiles</a>
          </div>
        </div>
      </section>

      <section className="tool-panel">
        <div className="section-title">
          <h2>Review progress</h2>
          <span>{readiness.score}%</span>
        </div>
        <div className="check-list">
          {readiness.checks.map((check) => (
            <span key={check.label} className={check.complete ? "complete" : ""}>{check.complete ? "✓" : "○"} {check.label}</span>
          ))}
        </div>
      </section>

      <section className="source-panel">
        <div className="section-title">
          <h2>Sources</h2>
          <span>{workspace.profileSources.length || profile.sources.length}</span>
        </div>
        {(workspace.profileSources.length ? workspace.profileSources : profile.sources).map((source) => (
          <div className="artifact-row" key={sourceKey(source)}>
            <span>{readableSourceType(source.type)}</span>
            <strong>{source.url ?? "manual input"}</strong>
            <small>{sourceStatus(source)}</small>
          </div>
        ))}
      </section>

      {userProvidedClaims.length || sourceWarnings.length ? (
        <section className="tool-panel">
          <div className="section-title">
            <h2>Review needed</h2>
            <span>{userProvidedClaims.length + sourceWarnings.length}</span>
          </div>
          {userProvidedClaims.length ? <p className="status">This profile includes user-provided information. Add a GitHub, website, paper, ORCID, or OpenAlex source to strengthen evidence.</p> : null}
          {sourceWarnings.length ? <p className="status warning">Some sources could not be imported. You can still review and publish this profile.</p> : null}
          {sourceWarnings.map((warning) => <span className="review-note" key={warning}>{warning}</span>)}
        </section>
      ) : null}

      <ClaimsPanel title="Verified details" claims={evidenceBackedClaims} onPatch={patchClaim} />
      <ClaimsPanel title="Details to review" claims={userProvidedClaims} onPatch={patchClaim} />
      <CardsPanel profile={profile} onPatch={patchCard} onRegenerate={regenerateCard} onCreateNote={createNote} />

      <section className="tool-panel">
        <div className="section-title">
          <h2>Publish</h2>
          <span>{profile.person.publicStatus === "published" ? "Published profile" : "Draft profile"}</span>
        </div>
        <p className="status">Publishing updates the public profile view for this local workspace.</p>
        <div className="actions">
          <button type="button" onClick={() => publish("published")}>Publish profile</button>
          <button type="button" onClick={() => publish("draft")}>Keep as draft</button>
          <a href={`/u/${profile.person.handle}`}>Preview public profile</a>
        </div>
      </section>
    </div>
  );
}

function ClaimsPanel({ title, claims, onPatch }: { title: string; claims: NonNullable<PersonProfile["claims"]>; onPatch: (claimId: string, patch: Record<string, unknown>) => Promise<void> }) {
  const groups = groupClaims(claims);
  return (
    <section className="claim-panel">
      <div className="section-title">
        <h2>{title}</h2>
        <span>{claims.length}</span>
      </div>
      {claims.length === 0 ? <p className="status">No claims in this group yet.</p> : null}
      {Object.entries(groups).map(([type, claims]) => (
        <div className="claim-group" key={type}>
          <p className="eyebrow">{readableClaimType(type)}</p>
          {claims.map((claim) => (
            <div className="claim-review" key={claim.id ?? claim.text}>
              <strong>{claim.text}</strong>
              <small>{claim.evidence.length} evidence item{claim.evidence.length === 1 ? "" : "s"} · {readableClaimStatus(claim.status ?? "approved")}</small>
              <EvidenceDrawer evidence={claim.evidence} />
              {claim.id ? (
                <div className="actions">
                  <button type="button" onClick={() => onPatch(claim.id!, { status: "approved" })}>Mark verified</button>
                  <button type="button" onClick={() => onPatch(claim.id!, { status: "rejected" })}>Remove from profile</button>
                  <button type="button" onClick={() => onPatch(claim.id!, { status: "pending" })}>Keep for review</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function CardsPanel({
  profile,
  onPatch,
  onRegenerate,
  onCreateNote
}: {
  profile: PersonProfile;
  onPatch: (cardId: string, patch: Record<string, unknown>) => Promise<void>;
  onRegenerate: (cardId: string) => Promise<void>;
  onCreateNote: (form: FormData) => Promise<void>;
}) {
  return (
    <section className="tool-panel">
      <div className="section-title">
        <h2>Cards</h2>
        <span>{profile.cards.length}</span>
      </div>
      <div className="workspace-cards">
        {profile.cards.map((card, index) => (
          <CardEditor
            card={card}
            key={card.id ?? `${card.type}-${card.title}`}
            onPatch={onPatch}
            onRegenerate={onRegenerate}
            canMoveUp={index > 0}
            canMoveDown={index < profile.cards.length - 1}
          />
        ))}
      </div>
      <form className="generator-form" onSubmit={(event) => {
        event.preventDefault();
        void onCreateNote(new FormData(event.currentTarget));
        event.currentTarget.reset();
      }}>
        <div className="field-grid">
          <label>
            Note title
            <input name="title" defaultValue="Profile note" />
          </label>
          <label className="span-2">
            Note content
            <textarea name="contentMd" defaultValue="Add context that should appear on the profile." />
          </label>
        </div>
        <button type="submit">Add note card</button>
      </form>
    </section>
  );
}

function CardEditor({
  card,
  onPatch,
  onRegenerate,
  canMoveUp,
  canMoveDown
}: {
  card: ProfileCard;
  onPatch: (cardId: string, patch: Record<string, unknown>) => Promise<void>;
  onRegenerate: (cardId: string) => Promise<void>;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [title, setTitle] = useState(card.title);
  const [contentMd, setContentMd] = useState(card.contentMd);
  const [visibility, setVisibility] = useState(card.visibility ?? "public");
  const cardId = card.id;

  async function save() {
    if (!cardId) {
      return;
    }
    await onPatch(cardId, { title, contentMd, visibility });
  }

  async function move(delta: number) {
    if (!cardId) {
      return;
    }
    await onPatch(cardId, { order: (card.order ?? 0) + delta });
  }

  return (
    <article className="profile-card editor-card">
      <p className="eyebrow">{readableCardType(card.type)}</p>
      <input value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea value={contentMd} onChange={(event) => setContentMd(event.target.value)} />
      <select value={visibility} onChange={(event) => setVisibility(event.target.value as CardVisibility)}>
        <option value="public">Visible on profile</option>
        <option value="private">Private to workspace</option>
        <option value="hidden">Hidden</option>
      </select>
      <EvidenceDrawer evidence={card.evidence} />
      <div className="actions">
        <button type="button" onClick={save}>Save changes</button>
        <button type="button" disabled={!canMoveUp} onClick={() => move(-15)}>Move earlier</button>
        <button type="button" disabled={!canMoveDown} onClick={() => move(15)}>Move later</button>
        {cardId ? <button type="button" onClick={() => onRegenerate(cardId)}>Refresh from sources</button> : null}
      </div>
    </article>
  );
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
    case "note":
      return "Note";
    default:
      return value.replace(/_/g, " ");
  }
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

function readableClaimType(value: string) {
  switch (value) {
    case "research_area":
      return "Research area";
    default:
      return value.replace(/_/g, " ");
  }
}

function readableClaimStatus(value: string) {
  switch (value) {
    case "approved":
      return "verified";
    case "rejected":
      return "removed";
    case "pending":
      return "in review";
    default:
      return value.replace(/_/g, " ");
  }
}

function groupClaims(claims: NonNullable<PersonProfile["claims"]>) {
  return claims.reduce<Record<string, typeof claims>>((groups, claim) => {
    groups[claim.type] = [...(groups[claim.type] ?? []), claim];
    return groups;
  }, {});
}

function sourceKey(source: WorkspaceData["profileSources"][number] | PersonProfile["sources"][number]) {
  return `${source.type}-${source.url ?? ("id" in source ? source.id : undefined) ?? "manual"}`;
}

function sourceStatus(source: WorkspaceData["profileSources"][number] | PersonProfile["sources"][number]) {
  const status = "status" in source ? source.status : "imported";

  switch (status) {
    case "imported":
      return "Imported";
    case "completed":
      return "Imported";
    case "pending":
      return "Needs review";
    case "warning":
      return "Needs review";
    case "failed":
      return "Import issue";
    default:
      return status.replace(/_/g, " ");
  }
}
