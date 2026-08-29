/**
 * URL-addressable views (SRD-v2 FR-15, D16): '#/view/<id>' opens the shell at the
 * named view, and activating a view writes the hash back, so the address bar always
 * names what is shown. A deep link selects what is shown, never what happened: no
 * manifest state travels here.
 */

export function viewFromHash(hash: string): string | undefined {
  const match = /^#\/view\/([a-z][a-z0-9_-]*)$/.exec(hash);
  return match?.[1];
}

export function hashForView(viewId: string): string {
  return `#/view/${viewId}`;
}
