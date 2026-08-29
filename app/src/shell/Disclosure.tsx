/**
 * Progressive discovery, in one control (feature 112, FR-011 to FR-014).
 *
 * At a narrow width a panel shows its primary surface and keeps everything else one
 * labelled gesture away. Nothing is removed — the union of what is open and what is
 * disclosed is what the same panel shows at a desktop width (SC-007).
 *
 * It is `<details>`/`<summary>` rather than a hand-rolled toggle, so keyboard
 * operation, focus order and assistive-technology semantics are the platform's and not
 * this file's (FR-013). Feature 111's keyboard guarantee is inherited by everything
 * built on this rather than re-argued.
 *
 * Above the threshold there is no disclosure at all: the region renders as a plain
 * section named by the same label, which is what FR-014 asks for — the desktop panel
 * renders as it does today, and the label is not chrome its viewer has to read or a
 * control they can accidentally collapse. Two render shapes rather than one `<details>`
 * held open by a prop: a `<details open>` can still be closed by a click, and a
 * summary suppressed with CSS is a control that is invisible and still focusable.
 *
 * The label names its content. "More" and "options" are defects (FR-012): they put the
 * viewer's decision behind the thing they need in order to make it.
 *
 * Whether it is open is a per-viewer convenience: it never enters the address, never
 * enters the manifest, and changes nothing about what any component does (FR-015).
 */
import type { ReactNode } from 'react';

export interface DisclosureProps {
  /** Names the content, never the existence of more content. */
  readonly label: string;
  /** Whether the containing panel is narrow. Wide, the region is simply open. */
  readonly narrow: boolean;
  readonly children: ReactNode;
  /** For the panel's own styling; the disclosure adds its own class either way. */
  readonly className?: string;
}

export function Disclosure({ label, narrow, children, className }: DisclosureProps) {
  const classes = className ? `disclosure ${className}` : 'disclosure';
  if (!narrow) {
    return (
      <section className={classes} data-narrow="false" data-label={label} aria-label={label}>
        <div className="disclosure-body">{children}</div>
      </section>
    );
  }
  return (
    <details className={classes} data-narrow="true" data-label={label}>
      <summary>{label}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
