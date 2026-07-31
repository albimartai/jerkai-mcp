@AGENTS.md
@docs/context.md
@docs/definition-of-ready-and-done.md

<!--
Durable, every-session context only.

Build PRDs are NOT imported here once their slice has shipped. A Build PRD is imported
while its slice is being built, and the shipping PR removes that import in the same PR
(DL-2026-07-26-b). The snapshot at docs/prd/mcp-server-foundations-metric-registry.md
describes slice 1, which shipped 2026-07-29, so it stays readable on demand and is not
loaded automatically — importing shipped requirements as live context wastes budget and
blurs what is still in force.

The next slice's session adds its own PRD import here, and drops it again on merge.

README.md is not imported either: it is the tool contract and script reference, read when
needed rather than every session.
-->
