"use client";

import { useState } from "react";
import { apiRequest, type ProfileGenerationResponse } from "../lib/api";

export function ProfileGenerateForm() {
  const [displayName, setDisplayName] = useState("Demo Agent Builder");
  const [handle, setHandle] = useState("demo-agent-builder");
  const [headline, setHeadline] = useState("AI agent engineer");
  const [github, setGithub] = useState("demo-agent-builder");
  const [website, setWebsite] = useState("");
  const [openAlex, setOpenAlex] = useState("");
  const [arxiv, setArxiv] = useState("");
  const [orcid, setOrcid] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProfileGenerationResponse | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    const sources = [
      github ? { type: "github", input: github } : undefined,
      website ? { type: "website", input: website } : undefined,
      openAlex ? { type: "openalex", input: openAlex } : undefined,
      arxiv ? { type: "arxiv", input: arxiv } : undefined,
      orcid ? { type: "orcid", input: orcid } : undefined,
      manualTitle || manualUrl || manualNote
        ? {
            type: "manual",
            input: {
              title: manualTitle || undefined,
              url: manualUrl || undefined,
              note: manualNote || undefined
            }
          }
        : undefined
    ].filter(Boolean);

    try {
      const generated = await apiRequest<ProfileGenerationResponse>("/api/profiles/generate", {
        method: "POST",
        body: JSON.stringify({
          displayName,
          handle,
          headline,
          sources
        })
      });
      setResult(generated);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Profile generation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="tool-panel">
      <form className="generator-form" onSubmit={submit}>
        <div className="field-grid">
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            Handle
            <input value={handle} onChange={(event) => setHandle(event.target.value)} />
          </label>
          <label className="span-2">
            Headline
            <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
          </label>
        </div>

        <div className="field-grid">
          <label>
            GitHub
            <input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="username or URL" />
          </label>
          <label>
            Website
            <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
          </label>
          <label>
            OpenAlex
            <input value={openAlex} onChange={(event) => setOpenAlex(event.target.value)} placeholder="A123456789" />
          </label>
          <label>
            arXiv
            <input value={arxiv} onChange={(event) => setArxiv(event.target.value)} placeholder="2601.01234" />
          </label>
          <label>
            ORCID
            <input value={orcid} onChange={(event) => setOrcid(event.target.value)} placeholder="0000-0002-1825-0097" />
          </label>
        </div>

        <div className="field-grid">
          <label>
            Manual link title
            <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
          </label>
          <label>
            Manual link URL
            <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} />
          </label>
          <label className="span-2">
            Manual note
            <textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} />
          </label>
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Generating" : "Generate profile"}
        </button>
      </form>

      {error ? <p className="status error">{error}</p> : null}
      {result ? (
        <div className="result-strip">
          <span>{result.status}</span>
          <span>{result.cardsGenerated} cards</span>
          <span>{result.claimsGenerated} claims</span>
          <a href={result.profileUrl}>Open profile</a>
          <a href={`/discover?q=${encodeURIComponent(`${displayName} ${headline}`)}`}>Search similar</a>
        </div>
      ) : null}
    </section>
  );
}
