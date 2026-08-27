// Innocent: the curated mechanism in this fixture imports nothing from the other two, so
// a separation test that reported every file would be reporting noise rather than the
// violation.
export function curate() {
  return "candidate";
}
