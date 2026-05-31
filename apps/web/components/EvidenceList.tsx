"use client";

import type { EvidenceRef } from "../lib/api";

export function EvidenceList({ evidence, compact = false }: { evidence: EvidenceRef[]; compact?: boolean }) {
  if (evidence.length === 0) {
    return <p className="status">No evidence attached.</p>;
  }

  return (
    <div className={compact ? "evidence-list compact" : "evidence-list"}>
      {evidence.map((item, index) => (
        item.url ? (
          <a href={item.url} key={`${item.type}-${item.id}-${index}`} title={item.reason}>
            {item.title}
          </a>
        ) : (
          <span key={`${item.type}-${item.id}-${index}`} title={item.reason}>
            {item.title}
          </span>
        )
      ))}
    </div>
  );
}

export function EvidenceDrawer({ evidence }: { evidence: EvidenceRef[] }) {
  return (
    <details className="evidence-drawer">
      <summary>Evidence ({evidence.length})</summary>
      <EvidenceList evidence={evidence} />
    </details>
  );
}
