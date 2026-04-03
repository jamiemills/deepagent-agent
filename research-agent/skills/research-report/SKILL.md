---
name: research-report
description: Use this for substantial research requests that need a structured written deliverable with source-backed findings, caveats, and explicit open questions.
---

# Research Report Workflow

Use this skill when the user wants a serious research deliverable rather than a quick answer.

## Workflow

1. Create or update todos with the main workstreams.
2. Clarify the target scope through the user's request and available evidence.
3. Use `brave_search` to find strong source candidates.
4. Prefer primary sources, official documentation, standards bodies, filings, research papers, vendor docs, and direct statements.
5. Cross-check important claims across multiple sources.
6. Write working notes to `/notes/` if the task is substantial.
7. Write the final report to `/out/final-report.md` using the report template in `report-template.md`.
8. Write `/out/claim-ledger.json` containing key claims and the source URLs that support them.

## Source discipline

- Treat a single source as insufficient for consequential claims unless it is the source of record.
- If the sources disagree, preserve the disagreement in the output.
- Use explicit dates whenever available.
- Avoid vague claims like "industry leading" unless attributed.

## Output shape

Use `report-template.md` in this skill directory as the default structure.

The report should include:

- executive summary
- key findings
- evidence and citations
- caveats and uncertainty
- open questions
- next steps if the user needs action, not just information
