# Repository-local Go workflow

This is the public starter for the new JSON-first `.go/` workflow. Inside a repository created from this template, `.go/` is the source of truth; do not require `.go-workflow/config.yaml` and do not route through the legacy Life OS pipeline.

`Go` is the single public repository-work command. `Go plan`, `Go T123`, and
`Go loop 2h` are modifiers; stack commands such as `auto`, `go-loop`, task
creation, claim, and finish are internal primitives.

When the user says `Go`, uses a Go modifier, says `Next`, or asks to continue autonomously:

0. Before route, task creation, claim, or product edits, prove stack freshness with a trusted current `go-workflow-stack` checkout. Fetch its annotated tags, run `python3 /path/to/go-workflow-stack/cli/go.py stack update . --latest --stack-repo /path/to/go-workflow-stack --json`, apply only when `up_to_date=false`, then run `./go doctor . --platform <platform> --agent <agent-name> --json`. Require `exact_ref=true`, `compatible=true`, and `ready=true`. Stop if the trusted checkout, immutable tag, update, or doctor proof is unavailable; never substitute mutable `main`, an old global runtime, or `GO_STACK_ALLOW_DEV=1`.
1. Locate the pinned stack through the project-local `./go` launcher after the freshness preflight; set `GO_STACK` only to an exact matching immutable checkout.
2. Read `.go/vision.json`, `.go/architecture-principles.json`, `.go/hierarchy.json`, and the selected task JSON.
3. Run `bash scripts/validate-go.sh`, `./go status . --json`, and `./go router . --command go --intent "$PROMPT_TEXT" --json`. Use `selected_route` and the authority fields from the pinned runtime. Announce one `Route: <advice|wayfinder|vision|plan|task|now|goal|loop>` line and continue without asking for another Go command.
4. If this is still a copied template contract, customize it first with `./go spike . --brief "$PROJECT_INTENT"`.
5. Create or repair a concrete task before implementation, then execute only its allowed modify scope.
6. `Go plan` stops before implementation. Otherwise verify, critic/recheck, repair, record evidence, and continue until done, a repository gate, or budget exhaustion.

For substantial advice, do not persist the full response. Persist only a
validated compact execution brief with `./go recommendation create . --brief
<temporary-json>`. Explicit `alleen advies`/`read-only` uses `--read-only` and
must not mutate `.go`. A later bare `Go` or **Sent as goal** consumes
`.go/recommendations/pending.json`, archives it, creates semantic tasks, and
continues execution in the same invocation. Every R# outcome requires a
terminal disposition and non-empty evidence before finish. Internally pass
`--authority-source sent_as_goal` for Codex **Sent as goal** and
`--authority-source imperative` for a continuation such as “aan de slag”; bare
Go uses the default `go` source.

Run `bash scripts/check.sh` for the stack/template pairing check. Preserve unrelated user changes and do not push without explicit authorization.

## GitHub Actions boundary

GitHub Actions are off limits. Do not create, edit, enable, trigger, dispatch, inspect, wait for, or use GitHub Actions workflows/checks as verification evidence. Existing files under `.github/workflows/` are not authorization to interact with GitHub Actions. Use local checks, a local Linux container, or another explicitly approved verification route instead.

<!-- go-workflow:agents-gateway:v1:start -->
## Repository-local Go workflow gateway

This repository uses `.go/` as its project workflow source of truth. Keep repository-specific instructions outside this managed block; they remain binding.

When the user invokes `Go`, `Go plan`, `Go <task-id>`, `Go loop`, or asks to continue autonomously:

1. Run the immutable stack-freshness preflight required by the pinned `.go/project.json` before routing or product edits.
2. Read `.go/vision.json`, `.go/architecture-principles.json`, `.go/hierarchy.json`, and the selected task.
3. Run the repository-local `validate`, `status`, and `router` commands, then announce `Route: <selected_route>`.
4. Create or repair a concrete `.go` task before changing product files. Execute one task at a time and stay within its `scope.modify` boundary.
5. Record content-bound verification evidence, run the required critic/recheck, repair blocking findings, and satisfy finish plus any required release evidence.
6. Continue through remaining in-scope work until the goal is met, a declared budget is exhausted, or a real repository gate blocks progress. Never call an empty queue `done` without auditing the original outcomes.
7. “Go tot alle taken klaar” freezes all unfinished in-scope task IDs, including blocked tasks, into the existing campaign controller. Show scope and dependency order; do not invent a five-task or two-hour ceiling. Explicit user budgets still apply.
8. Finish each task through claim, implementation, verification, independent review, commit, authorized push, configured deployment/readback and synchronized closure before announcing done and starting another. New authorized taskwise runs default to push; user/repository restrictions and frozen older-run authority prevail. Deployment without a requirement is not applicable; required unconfigured deployment is blocked.
9. Use the versioned progress outbox and an independently capable transport for task start, phase, repair, amendment, done and final messages. Preflight transport before unattended execution. A separate watcher offers a heartbeat every 300 seconds; no connected transport means no promised chat heartbeat. Retain undelivered events and stop before the next task until delivery recovers.
10. Resume from current canonical task, workspace, proof and publication records. Keep necessary repair tasks linked to original outcomes, show amended future tasks, and continue independent work around concrete blockers. Never count status/log churn as proven progress or expand an old run’s authority implicitly.

Do not redirect repository workflow state to a hidden central queue or retired vault. Nested `AGENTS.md` files may add directory-specific obligations, but they do not replace the root gateway or `.go` source of truth.
<!-- go-workflow:agents-gateway:v1:end -->
