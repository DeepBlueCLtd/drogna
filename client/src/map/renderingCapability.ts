/**
 * Whether this browser can draw a map at all, asked before anything tries to.
 *
 * The specification's first edge case: where the rendering machinery is unavailable, the
 * shell and every non-map panel render normally and the map region says what is missing
 * and why. That preserves the shell-first ordering feature 003 established, and it is the
 * difference between a page that is missing one panel and a page that is broken.
 *
 * The probe is a real one. Asking whether the constructor exists is not the question —
 * every browser has had it for a decade — the question is whether a context can be
 * obtained, which is what fails on a machine with no GPU, in a hardened profile, in a
 * headless browser started without the right switches, or when the tab has lost its
 * context to another one. The probe canvas is never attached to the document and is
 * dropped immediately.
 *
 * It answers "unavailable, and here is why" under Node as well, where there is no document
 * at all. That is not an accident of testing: it means the honest-degradation path is the
 * one every unit test in this feature takes, so the branch that is hardest to reach in a
 * browser is the one with the most coverage rather than the least.
 */

export interface RenderingCapability {
  readonly available: boolean;
  /** Why not, where it is not. Null where a surface was obtained. */
  readonly because: string | null;
}

export const AVAILABLE: RenderingCapability = { available: true, because: null };

/** The document a probe would use, narrowed to what this module needs, so a test can pass one. */
export interface ProbeHost {
  createElement(tag: string): {
    getContext(kind: string): unknown;
  };
}

/** The element name and context name the probe asks for. */
const CANVAS = "canvas";
const CONTEXT = "webgl2";

/**
 * The answer for this page, remembered, because asking is not free.
 *
 * Every probe obtains a real context, and a browser holds only a handful of them: asking
 * once per render cost one context per frame, and Chromium answered by discarding the
 * oldest — which is the context the map itself was drawing into. The map went blank on a
 * running stack and nothing in the page said why, because from the page's point of view
 * every probe had succeeded. Found by reading the browser console against the composed
 * stack, and it is the reason this cache exists rather than tidiness.
 *
 * Only the no-host path is remembered. A caller that supplies its own probe is asking a
 * different question and gets a fresh answer.
 */
let remembered: RenderingCapability | null = null;

/**
 * Ask the browser for a drawing surface, and report what it said.
 *
 * Every failure is caught rather than propagated. A page that threw while asking whether
 * it could draw would take the whole shell down to answer a question about one panel,
 * which is precisely the outcome the shell-first ordering exists to prevent.
 */
export function renderingCapability(host?: ProbeHost): RenderingCapability {
  if (host === undefined) {
    remembered = remembered ?? probe(undefined);
    return remembered;
  }
  return probe(host);
}

function probe(host: ProbeHost | undefined): RenderingCapability {
  const document = host ?? (globalThis as { document?: ProbeHost }).document;
  if (document === undefined) {
    return {
      available: false,
      because:
        "this page is not running in a browser document, so there is no canvas to obtain " +
        "a drawing context from",
    };
  }
  try {
    const canvas = document.createElement(CANVAS);
    const context = canvas.getContext(CONTEXT);
    if (context === null || context === undefined) {
      return {
        available: false,
        because:
          `the browser has a canvas but would not give this page a ${CONTEXT} context. ` +
          "That is usually a machine with no usable graphics device, or a browser " +
          "configured not to offer one",
      };
    }
    return AVAILABLE;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      because: `asking the browser for a ${CONTEXT} context raised ${detail}`,
    };
  }
}
