# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues at <https://github.com/tee229/fakebombit/issues>. Use the `gh` CLI for issue operations. Install `gh` before creating or reading issues.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `origin` points to this GitHub repository.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` only if external PRs should enter the triage queue.

## Skill operations

- “Publish to the issue tracker”: create a GitHub issue.
- “Fetch the relevant ticket”: run `gh issue view <number> --comments`.

## Wayfinding

- Map: one issue labelled `wayfinder:map`.
- Child ticket: a sub-issue, or a task-list link with `Part of #<map>` when sub-issues are unavailable. Label it `wayfinder:<type>`.
- Blocking: use native issue dependencies where available; otherwise record `Blocked by: #<n>` in the child issue.
- Frontier: choose the first open, unassigned child whose blockers are closed.
- Claim: assign the child to the current developer before working on it.
- Resolve: comment with the answer, close the child, and add a short context pointer to the map.
