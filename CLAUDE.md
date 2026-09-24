# Product Jury 2.0 — working rules

## Source of truth

`Product-Jury-PRD-v1.1.1.md` is the product source of truth. Nothing below it
may change what the product must do.

Precedence, highest first. A tool, a heuristic or a convenience never moves
anything above it:

1. The PRD (v1.1.1), including its capability cards, FR/NFR/TR/PR/SR/TEL rows
   and its named findings.
2. QA findings and the reconciliation record.
3. The integrity rules in `server/integrity/` and `server/claims/` — the
   error taxonomy, provenance, the untrusted-content boundary, the language
   policy, content-free telemetry, and the FAILED / INSUFFICIENT wall.
4. The test suite. A failing test is a defect, never a test to relax.
5. The acceptance criteria of the stage currently being built.
6. Everything else, including the development tools below.

## Development tools

Neither tool is a Product Jury runtime dependency. Neither is in the
application bundle, and neither may add one.

**ponytail** (`claude plugin`, user scope; mode `full` in
`~/.config/ponytail/config.json`). A reasoning aid for keeping a change to the
smallest coherent one: inspect before editing, reuse the contracts that exist,
add no abstraction nobody asked for, prefer deletion when the existing
structure is wrong, stop when the stage is complete.

It is not the source of truth. It may not be used to justify removing a PRD
requirement, a QA finding, an integrity rule, a test, or a stage acceptance
criterion. Where this codebase is deliberately explicit — closed schemas,
fail-closed validation, named refusals, comments that record why a thing is
the way it is — that explicitness is the requirement, and "smaller" is not an
argument against it.

**graphify** (`uv tool install graphifyy`; skill at
`~/.claude/skills/graphify/`). A structural view of the repository, built
locally from tree-sitter AST with no model involved. Use it to see who imports
what before changing anything. It describes the code as it is; it never says
what the product should do.

Build the graph out of tree, so nothing lands in the repository:

```
graphify extract . --code-only --out <a directory outside this repo>
```

## Stage discipline

The build runs in approval-gated stages. Each stage ends with one report and a
full stop. Do not start the next stage without approval, and do not widen a
stage's scope because the next one would need it.
