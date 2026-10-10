/**
 * The kernel-honest commitment gate for the J9 surface: same structure as the
 * buyer-support gate (terms, consequence, evidence, explicit confirm), with
 * the demo-boundary line rewritten for kernel-driven actions — confirming
 * submits a typed command to the deterministic in-memory commerce kernel,
 * never a live provider call.
 */
import type { JSX } from "react";

import { TermLine } from "../buyer-support/ui.js";

export function KernelCommitmentGate({
  title,
  terms,
  consequence,
  evidence,
  confirmLabel,
  cancelLabel = "Not now",
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly terms: readonly { readonly label: string; readonly value: string }[];
  readonly consequence: string;
  readonly evidence: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <div className="cm-card" data-testid="cm-commitment-gate" style={{ borderColor: "var(--cm-warn)" }}>
      <h3 className="cm-card-title">{title}</h3>
      <div>
        {terms.map((term) => (
          <TermLine key={term.label} label={term.label} value={term.value} />
        ))}
        <TermLine label="What happens if you confirm" value={consequence} />
        {evidence.length > 0 ? (
          <TermLine label="Evidence this is based on" value={evidence.join(" · ")} />
        ) : null}
        <TermLine
          label="Demo boundary"
          value="Confirming submits a typed command to the deterministic in-memory commerce kernel. No live order, payment, shipment or external system is ever contacted."
        />
      </div>
      <div className="cm-row" style={{ marginTop: 10 }}>
        <button type="button" className="cm-button cm-button-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="cm-button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
