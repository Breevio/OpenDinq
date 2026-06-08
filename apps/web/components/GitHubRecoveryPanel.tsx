"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
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
    <div className="recovery-panel">
      <div className="recovery-header">
        <span className="recovery-icon" aria-hidden="true">
          <AlertTriangle className="ui-icon" strokeWidth={2.2} />
        </span>
        <div>
          <p className="eyebrow">GitHub import limited</p>
          <strong>{advice.title}</strong>
        </div>
      </div>
      <p className="status">{advice.message}</p>
      {onRetry ? (
        <div className="actions">
          <button type="button" className="secondary-button" onClick={onRetry}>
            <RefreshCw className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
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
