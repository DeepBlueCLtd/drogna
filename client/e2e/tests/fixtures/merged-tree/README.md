# A deliberately merged tree

This is not a mechanism. It is the control for `separation.test.ts`: a miniature of
`scripts/capture/` in which the glance entry point imports the pair's clock pinning,
which is exactly the merge PR-10 forbids and exactly the merge somebody will propose the
first time they notice the three scripts look alike.

The separation test runs over this tree as well as over the real one and asserts that it
*fails* here, naming the import. Without it, the separation test passing over a tree
where nothing has ever crossed is indistinguishable from a separation test that reads no
imports at all.

Nothing here runs. It exists to be rejected.
