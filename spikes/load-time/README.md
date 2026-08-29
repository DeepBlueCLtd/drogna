# Spike: first-load time of a published instance

The finding is in `FINDING.md`. This is how to reproduce it.

Everything runs from the repository root. Playwright is a root dev dependency; the
browser is wherever the environment put it, so `DROGNA_CHROMIUM` names it when it is not
where Playwright expects (in the cloud sessions it is `/opt/pw-browsers/chromium`).

```sh
export DROGNA_CHROMIUM=/opt/pw-browsers/chromium   # only if Playwright cannot find one

pnpm -C app build
node spikes/load-time/serve.mjs app/dist 4174 &
node spikes/load-time/measure.mjs http://127.0.0.1:4174/ 4x slowish
```

`serve.mjs` gzips, which is the point of it: `vite preview` and the usual one-liners hand
over the 1.9 MB chunk uncompressed, and every throttled reading then blames the network
for about four times what it costs. It holds each response in memory, so **restart it
after a rebuild** — otherwise it serves an `index.html` naming the previous chunk hash
and the measurement quietly reads the old build.

`measure.mjs` takes a URL, a CPU multiplier (`1x`, `4x`, `6x`) and a line (`none`,
`broadband`, `slowish`, `fast3g`). The multiplier is the axis that is easy to leave out
and matters most: 1× is a developer's machine and not the machine the demo is watched on.

```sh
node spikes/load-time/phases.mjs 4x      # the boot second, phase by phase
node spikes/load-time/bundle.mjs         # which package contributed which bytes
```

`phases.mjs` needs `performance.mark` calls inside `app/src`, where they may not live —
so it edits four files, builds, measures, and restores them in a `finally`. It refuses to
start against a dirty `app/src`, because the restore is an overwrite and would otherwise
lose work; and it stops if one of its anchor strings has drifted, rather than measuring a
build with a mark missing and reporting that phase as zero. Both refusals were watched
firing before the finding's numbers were trusted. If it ever exits without restoring,
`git checkout -- app/src` is the repair.

`prototype-lazy-map.patch` is the §5.1 change as measured — a spike prototype, not a
proposed diff. `git apply` it, rebuild, restart the server, measure, and
`git checkout -- app/src/shell/Shell.tsx`.

`results/` holds the output the finding quotes.
