#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVIDENCE_DIR="$ROOT_DIR/.sisyphus/evidence"

mkdir -p "$EVIDENCE_DIR"

FIXTURE_DIR="$(mktemp -d "$ROOT_DIR/.sisyphus/pass3-fixture.XXXXXX")"
mkdir -p "$FIXTURE_DIR/.claude/collab/requests" "$FIXTURE_DIR/.claude/orchestrate"

node -e "const fs=require('fs'); const path=require('path'); const dir=process.argv[1]; fs.mkdirSync(path.join(dir,'.claude','collab'), {recursive:true}); fs.writeFileSync(path.join(dir,'TASKS.md'), '## Phase 3\n### [ ] T0.1: Pass 3 approval fixture\n', 'utf8'); fs.writeFileSync(path.join(dir,'.claude','orchestrate-state.json'), JSON.stringify({tasks:[{id:'T0.1',title:'Pass 3 approval fixture',status:'pending',owner:'fixture-agent'}]}, null, 2), 'utf8'); fs.writeFileSync(path.join(dir,'.claude','orchestrate','auto-state.json'), JSON.stringify({session_id:'run-pass3-1',pending_gate:{gate_id:'gate-pass3-1',gate_name:'Final Gate',stage:'final_gate',task_id:'T0.1',run_id:'run-pass3-1',correlation_id:'gate:run-pass3-1:final_gate',choices:['approve','reject'],default_behavior:'wait_for_operator',timeout_policy:'wait_60000ms',created_at:'2026-03-07T00:00:00.000Z',preview:'Pass 3 gate preview'}}, null, 2), 'utf8'); const events=[{schema_version:'1.0',event_id:'evt-pass3-1',ts:'2026-03-07T00:00:00.000Z',type:'approval_required',producer:'orchestrate-auto',correlation_id:'gate:run-pass3-1:final_gate',data:{actor:'system',gate_id:'gate-pass3-1',task_id:'T0.1',run_id:'run-pass3-1',choices:['approve','reject'],default_behavior:'wait_for_operator',timeout_policy:'wait_60000ms'}},{schema_version:'1.0',event_id:'evt-pass3-2',ts:'2026-03-07T00:00:01.000Z',type:'execution_paused',producer:'orchestrate-auto',correlation_id:'gate:run-pass3-1:final_gate',data:{actor:'system',gate_id:'gate-pass3-1',task_id:'T0.1',run_id:'run-pass3-1'}}]; fs.writeFileSync(path.join(dir,'.claude','collab','events.ndjson'), events.map((evt)=>JSON.stringify(evt)).join('\n')+'\n', 'utf8'); fs.writeFileSync(path.join(dir,'.claude','collab','control.ndjson'), '', 'utf8');" "$FIXTURE_DIR"

node "$ROOT_DIR/skills/task-board/scripts/board-builder.js" --project-dir="$FIXTURE_DIR" --dry-run --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-board.json"
node "$ROOT_DIR/skills/whitebox/scripts/whitebox-control-state.js" --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-control-state.json"
node "$ROOT_DIR/skills/whitebox/scripts/whitebox-control.js" list --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-approvals-list.json"
node "$ROOT_DIR/skills/whitebox/scripts/whitebox-control.js" show --project-dir="$FIXTURE_DIR" --gate-id=gate-pass3-1 --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-approvals-show.json"
node "$ROOT_DIR/skills/whitebox/scripts/whitebox-explain.js" --task-id=T0.1 --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-explain-pending.json"

node - "$ROOT_DIR" "$FIXTURE_DIR" > "$EVIDENCE_DIR/pass-3-applier.json" 2>&1 <<'EOF' &
const path = require('path');

const rootDir = process.argv[2];
const projectDir = process.argv[3];
const orchestrator = require(path.join(rootDir, 'skills/orchestrate-standalone/scripts/auto/auto-orchestrator.js'));
const engineAdapter = require(path.join(rootDir, 'skills/orchestrate-standalone/scripts/auto/engine-adapter.js'));

(async () => {
  const autoState = engineAdapter.loadAutoState(projectDir);
  const result = await orchestrator.waitForFileGateDecision(autoState, 'Final Gate', 'Pass 3 gate preview', {
    projectDir,
    stage: 'final_gate',
    approvalPollIntervalMs: 10,
    approvalWaitMs: 1000,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
EOF
APPLIER_PID=$!

node "$ROOT_DIR/skills/whitebox/scripts/whitebox-control.js" approve --project-dir="$FIXTURE_DIR" --gate-id=gate-pass3-1 --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-approvals-approve.json"
wait "$APPLIER_PID"

node "$ROOT_DIR/skills/whitebox/scripts/whitebox-control-state.js" --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-control-state-after.json"
cargo build --manifest-path "$ROOT_DIR/skills/task-board/tui/Cargo.toml" 2>&1 | tee "$EVIDENCE_DIR/pass-3-cargo.txt"

if command -v tmux >/dev/null 2>&1; then
  tmux new-session -d -s wb "bash -lc '$ROOT_DIR/skills/task-board/scripts/board-show.sh --project-dir=\"$FIXTURE_DIR\"'"
  sleep 1
  tmux capture-pane -pt wb:0 > "$EVIDENCE_DIR/pass-3-tui.txt"
  tmux kill-session -t wb
else
  WHITEBOX_TUI_CAPTURE=1 "$ROOT_DIR/skills/task-board/scripts/board-show.sh" --project-dir="$FIXTURE_DIR" > "$EVIDENCE_DIR/pass-3-tui.txt"
fi

node "$ROOT_DIR/skills/whitebox/scripts/whitebox-status.js" --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-status.json"
node "$ROOT_DIR/skills/whitebox/scripts/whitebox-explain.js" --task-id=T0.1 --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-explain.json"
set +e
node "$ROOT_DIR/skills/whitebox/scripts/whitebox-health.js" --project-dir="$FIXTURE_DIR" --json 2>&1 | tee "$EVIDENCE_DIR/pass-3-health.json"
HEALTH_STATUS=${PIPESTATUS[0]}
set -e
printf '%s\n' "$HEALTH_STATUS" > "$EVIDENCE_DIR/pass-3-health.exit"
grep -n "whitebox\|Ratatui\|approve\|reject\|task-board" "$ROOT_DIR/README.md" "$ROOT_DIR/README_ko.md" "$ROOT_DIR/INSTALL.md" "$ROOT_DIR/skills/whitebox/SKILL.md" "$ROOT_DIR/skills/task-board/SKILL.md" 2>&1 | tee "$EVIDENCE_DIR/pass-3-docs.txt"
