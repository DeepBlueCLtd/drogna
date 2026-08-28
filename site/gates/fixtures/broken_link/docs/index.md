# A page whose links do not resolve

Four deliberate faults, one per validation rule the real site raises.

1. A link to a page that does not exist: [a missing page](does-not-exist.md).
2. A link to a repository file that is not published — the case the task singles out:
   [the gates runner](../../../run_gates.py).
3. A link to an anchor that is not on the page it names:
   [a dangling anchor](published.md#no-such-heading).
4. An absolute link, which the real site forbids because it breaks when the site is served
   from a base path: [an absolute link](/published/).

`unpublished.md` sits in this directory and is absent from the navigation, which is the
fifth fault and the one `omitted_files` reports.
