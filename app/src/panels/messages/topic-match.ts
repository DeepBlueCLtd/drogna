/**
 * MQTT-semantics filter matching, front-end copy. Deliberately not imported from the
 * broker: that would cross the seam (Constitution XI). The seam's wire vocabulary —
 * how filters match topics — is contract, and both sides implement it; a divergence
 * would show as a Messages row validating against no master.
 */
export function topicMatchesFilter(filter: string, topic: string): boolean {
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');
  for (let i = 0; i < filterParts.length; i++) {
    const part = filterParts[i];
    if (part === '#') return true;
    if (i >= topicParts.length) return false;
    if (part !== '+' && part !== topicParts[i]) return false;
  }
  return filterParts.length === topicParts.length;
}
