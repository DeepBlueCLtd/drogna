/**
 * Presentation of simulation instants. The wire carries microsecond ISO-8601
 * because the masters and the replay claim need it; nobody reading a header
 * does, so the display trims to whole seconds. Presentation only — anything
 * composed into a request or compared against a document keeps the wire form.
 */
export function displayInstant(iso: string): string {
  return iso.replace(/\.\d+Z$/, 'Z');
}
