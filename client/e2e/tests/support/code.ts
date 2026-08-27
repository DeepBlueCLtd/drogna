/**
 * A source file with its comments blanked out, line numbering preserved.
 *
 * Two tests in this directory check for the absence of something — a shared module that
 * names a mechanism, a capture path that could synthesise traffic — and an absence can
 * only be checked by looking. Looking at raw text finds the prose explaining why the thing
 * is absent, which is the one place it must be allowed to appear: the argument for a
 * constraint has to be written down beside the constraint or nobody will find it.
 *
 * Coarse on purpose. A parser would be more precise and would also be a second thing to
 * keep correct. Nothing under `client/e2e/` or `scripts/capture/` contains a string
 * literal with `//` inside it, which is the one case this gets wrong.
 */
export function codeLines(text: string): string[] {
  let inBlock = false;
  return text.split("\n").map((line) => {
    let out = line;
    if (inBlock) {
      const end = out.indexOf("*/");
      if (end === -1) {
        return "";
      }
      out = out.slice(end + 2);
      inBlock = false;
    }
    const block = out.indexOf("/*");
    if (block !== -1) {
      const end = out.indexOf("*/", block + 2);
      if (end === -1) {
        inBlock = true;
        out = out.slice(0, block);
      } else {
        out = out.slice(0, block) + out.slice(end + 2);
      }
    }
    const rest = out.indexOf("//");
    return rest === -1 ? out : out.slice(0, rest);
  });
}
