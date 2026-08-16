# AGENTS.md

Operational guide for `@askrjs/schema`, which owns executable schemas and their
deterministic OpenAPI projection.

## Askr North Star

Keep the path from declaration to runtime validation and OpenAPI output
narratable. Enforce invalid schema construction immediately with errors that
name the contract and correction. Give every primitive distinct parse failure
codes, paths, and messages, and mechanically cross-check runtime behavior
against generated OpenAPI. Keep validation, inference, and projection visible
as separate contracts. Prefer explicit object, coercion, and additional-key
policy over inference, and add combinators only for demonstrated application
needs.

Run `npm run check` before declaring a change ready.

## Optimization Gate

A benchmark number is only half of an optimization's success criterion. The
change must also preserve a causal path that a human or agent can narrate in one
sentence.

Every benchmark-driven change must include:

1. the one-sentence causal description of the optimized path;
2. the exact fallback trigger and proof that optimized and fallback paths have
   identical observable behavior and error surfaces;
3. an explicit legibility-cost statement, including `none` when no new path or
   concept is introduced; and
4. evidence that a measured bottleneck in a real application justifies the
   optimization now.

Prefer making the existing single path faster. New caches, inference,
memoization, shortcuts, fast paths, or scheduler states require an explicit
legibility decision; a speedup alone does not justify them.
