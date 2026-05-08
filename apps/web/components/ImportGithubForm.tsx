"use client";

import { useState } from "react";
import { apiRequest } from "../lib/api";

type ImportResponse = {
  handle: string;
  cardCount: number;
  artifactCount: number;
};

export function ImportGithubForm() {
  const [input, setInput] = useState("demo-agent-builder");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const imported = await apiRequest<ImportResponse>("/api/import/github", {
        method: "POST",
        body: JSON.stringify({ input })
      });
      setResult(imported);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Import failed.");
    } finally {
      setIsLoading(false);
    }
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
            {isLoading ? "Importing" : "Import"}
          </button>
        </div>
      </form>

      {error ? <p className="status error">{error}</p> : null}
      {result ? (
        <div className="result-strip">
          <span>{result.artifactCount} artifacts</span>
          <span>{result.cardCount} cards</span>
          <a href={`/u/${result.handle}`}>Open profile</a>
        </div>
      ) : null}
    </section>
  );
}

