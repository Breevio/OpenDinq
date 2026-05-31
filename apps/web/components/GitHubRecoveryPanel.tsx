"use client";

import type { RecoveryAdvice } from "../lib/api";

export function GitHubRecoveryPanel({
  advice,
  onRetry,
  retryLabel
}: {
  advice: RecoveryAdvice;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="tool-panel">
      <p className="eyebrow">GitHub imports can be stronger</p>
      <p><strong>{advice.title}</strong></p>
      <p className="status">{advice.message}</p>
      <div className="result-strip">
        <span>Current result is still reviewable</span>
        <span>Add a GitHub token for richer data</span>
        <span>Retry this action</span>
      </div>
      {onRetry ? (
        <div className="actions">
          <button type="button" className="secondary-button" onClick={onRetry}>
            {retryLabel ?? "Retry"}
          </button>
        </div>
      ) : null}
      <details className="advanced-sources">
        <summary>Improve local GitHub imports</summary>
        <p className="status">Create a GitHub personal access token, expose it as <code>GITHUB_TOKEN</code>, then restart OpenDinq before retrying for fresher and more complete GitHub evidence.</p>
        <p className="status"><strong>{advice.actionLabel}:</strong> <code>{advice.actionCommand}</code></p>
        <p className="status">For a persistent local setup, add <code>GITHUB_TOKEN=YOUR_TOKEN</code> to your <code>.env</code> file before restarting <code>pnpm dev</code>.</p>
      </details>
    </div>
  );
}
