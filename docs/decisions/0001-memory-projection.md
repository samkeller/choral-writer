# 0001: Keep event history with JSONB branch projections

- Status: Accepted for the current stage
- Date: 2026-11-15

## Context

The MVP design note sketches normalized tables for entities, facts, and knowledge. The current implementation instead stores append-only narrative/mutation events and a JSONB `memory_projections.state` per branch. The engine applies and replays mutation events; the server creates branch projections when rewinding.

## Decision

Keep the current event history and JSONB projection model. Do not introduce normalized memory tables or a migration solely to match the old design note.

## Invariants

- Accepted memory mutations are represented in the event stream and applied through the engine reducer.
- A branch projection must match replay of the mutations visible on that branch.
- Rewind creates a new branch at a cutoff; it does not rewrite the prior branch history.
- Private knowledge filtering remains enforced by context construction.

## Consequences

This keeps the current storage and implementation simple while the product evolves. JSONB makes relational inspection and targeted queries less direct; if that becomes a measured constraint, revisit this decision with migration/backfill, rollback, and branch-history tests.
