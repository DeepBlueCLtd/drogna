// The pair's clock pinning, in miniature. In the real mechanism this is the part that
// sets the rate to zero and restores it afterwards, and it is the part a person merging
// the three mechanisms would reach for first, because it looks like a utility.
export function pin() {
  return "rate zero";
}
