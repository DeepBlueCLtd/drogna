**`pnpm check` is not the build, and CI runs three more things than it does.**

After the checks, CI runs `pnpm replay-proof` and then
three capture proofs — `capture:glance operator` and `capture:map`.
