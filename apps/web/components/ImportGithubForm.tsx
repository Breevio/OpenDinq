"use client";

import { useState } from "react";
import { apiRequest, type GitHubImportResponse } from "../lib/api";
import { GitHubRecoveryPanel } from "./GitHubRecoveryPanel";

export function ImportGithubForm() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GitHubImportResponse | null>(null);

  async function runImport() {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const imported = await apiRequest<GitHubImportResponse>("/api/import/github", {
        method: "POST",
        body: JSON.stringify({ input })
      });
      setResult(imported);
      if ((imported.status === "needs_review" || imported.warnings.length > 0) && typeof window !== "undefined") {
        window.location.assign(imported.workspaceUrl);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runImport();
  }

  return (
    <section className="tool-panel">
      <form className="command-form" onSubmit={submitImport}>
        <label htmlFor="github-input">GitHub username or profile URL</label>
        <div className="command-row">
          <input
            id="github-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="torvalds or https://github.com/torvalds"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Importing" : "Import profile"}
          </button>
        </div>
      </form>

      {error ? <p className="status error">{error}</p> : null}
      {result && (result.status === "needs_review" || result.warnings.length > 0) ? (
        <div className="tool-panel">
          <p className="status warning">OpenDinq imported what it could and opened a review workspace for anything that still needs confirmation.</p>
          {result.warnings.map((warning) => (
            <p className="status warning" key={warning}>{warning}</p>
          ))}
          {result.recoveryAdvice ? (
            <GitHubRecoveryPanel advice={result.recoveryAdvice} onRetry={runImport} retryLabel="Retry import" />
          ) : null}
          <div className="result-strip">
            <span>{result.artifactCount} artifacts</span>
            <span>{result.cardCount} cards</span>
            <a href={result.workspaceUrl}>Open workspace</a>
          </div>
        </div>
      ) : null}
      {result && result.status === "completed" && result.warnings.length === 0 ? (
        <div className="result-strip">
          <span>{result.artifactCount} artifacts</span>
          <span>{result.cardCount} cards</span>
          <a href={result.profileUrl}>Open profile</a>
        </div>
      ) : null}
    </section>
  );
}
