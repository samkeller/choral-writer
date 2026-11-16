# Documentation

`Documentation exists to reduce the cost of understanding, using, and maintaining the project.`

    - Prefer concise, accurate, actionable documentation over exhaustive descriptions.
    - Document the WHY, architectural decisions, non-obvious constraints, and operational procedures rather than repeating what the code already explains.
    - Treat source code, types, tests, and schemas as the primary source of truth.
    - Avoid documenting implementation details that can be understood directly from the code.
    - Keep documentation close to the code or domain it describes. (jsdoc or inline comments)
    - Update existing documentation instead of creating redundant files. Remove obsolete, duplicated, or misleading documentation. (Boy Scout Rule)
    - Create new documentation only when it serves a distinct, recurring, or important need.
    - Record significant architectural decisions as lightweight ADRs (context, decision, consequences).
    - Prefer meaningful names, types, and focused comments over extensive JSDoc.
    - Keep README focused on project overview, setup, usage, and navigation.

Documentation discipline:

    - Documentation is part of the change, not an automatic deliverable.
    - Do not generate a documentation file for every feature.
    - Do not create implementation reports, feature summaries, or redundant technical descriptions unless explicitly requested.
    - Before writing documentation, identify its audience, purpose, and long-term maintenance value.
    - Keep documents as organized and short as reasonably possible.
    - If the change requires no documentation update, do not create one.