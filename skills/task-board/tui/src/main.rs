use std::collections::HashMap;
use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use crossterm::event::{self, Event, KeyCode};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use notify::{Event as NotifyEvent, RecommendedWatcher, RecursiveMode, Watcher};
use ratatui::backend::{CrosstermBackend, TestBackend};
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::prelude::{Alignment, Color, Line, Modifier, Span, Style};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Terminal;
use serde::Deserialize;

const COLUMN_ORDER: [&str; 4] = ["Backlog", "In Progress", "Blocked", "Done"];
const WHITEBOX_CONTROL_SCRIPT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../whitebox/scripts/whitebox-control.js"
);
const WHITEBOX_CONTROL_STATE_SCRIPT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../whitebox/scripts/whitebox-control-state.js"
);
const WHITEBOX_SUMMARY_SCRIPT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../whitebox/scripts/whitebox-summary.js"
);
const WHITEBOX_EXPLAIN_SCRIPT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../whitebox/scripts/whitebox-explain.js"
);
const WATCH_DEBOUNCE: Duration = Duration::from_millis(250);
const ACTION_CONFIRM_TIMEOUT: Duration = Duration::from_secs(5);
const SUBMIT_WORK_TIMEOUT: Duration = Duration::from_secs(5);
const NARROW_WIDTH_THRESHOLD: u16 = 120;

#[derive(Debug, Clone, Deserialize, Default)]
struct Card {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    agent: Option<String>,
    #[serde(default)]
    blocker_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct BoardState {
    #[serde(default)]
    columns: HashMap<String, Vec<Card>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct TasksSummary {
    #[serde(default)]
    done: usize,
    #[serde(default)]
    total: usize,
    #[serde(default)]
    current_phase: Option<String>,
    #[serde(default)]
    next_task: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct NextRemediationTarget {
    #[serde(default)]
    id: String,
    #[serde(default)]
    reason: String,
    #[serde(default)]
    remediation: String,
}

#[derive(Debug, Clone, Deserialize, Default, PartialEq, Eq)]
struct PendingApproval {
    #[serde(default)]
    gate_id: String,
    #[serde(default)]
    gate_name: Option<String>,
    #[serde(default)]
    task_id: Option<String>,
    #[serde(default)]
    correlation_id: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    preview: String,
    #[serde(default)]
    evidence_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct WhiteboxSummary {
    #[serde(default)]
    gate_status: String,
    #[serde(default)]
    blocked_count: usize,
    #[serde(default)]
    pending_approval_count: usize,
    #[serde(default)]
    stale_artifact_count: usize,
    #[serde(default)]
    run_id_short: Option<String>,
    #[serde(default)]
    tasks: TasksSummary,
    #[serde(default)]
    next_remediation_target: Option<NextRemediationTarget>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ControlState {
    #[serde(default)]
    pending_approval_count: usize,
    #[serde(default)]
    pending_approvals: Vec<PendingApproval>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ExplainTarget {
    #[serde(rename = "type", default)]
    target_type: String,
    #[serde(default)]
    id: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ExplainOption {
    #[serde(default)]
    command: String,
    #[serde(default)]
    effect: String,
    #[serde(default)]
    risk: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ExplainCorrelation {
    #[serde(default)]
    run_id: Option<String>,
    #[serde(default)]
    last_event_type: Option<String>,
    #[serde(default)]
    last_event_ts: Option<String>,
    #[serde(default)]
    event_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ExplainReport {
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    target: ExplainTarget,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    remediation: Option<String>,
    #[serde(default)]
    options: Vec<ExplainOption>,
    #[serde(default)]
    evidence_paths: Vec<String>,
    #[serde(default)]
    correlation: ExplainCorrelation,
}

#[derive(Debug, Clone)]
struct App {
    snapshot: SnapshotState,
    selection: SelectionState,
    detail: DetailState,
    transient: TransientState,
    view: ViewState,
    project_dir: PathBuf,
}

#[derive(Debug, Clone)]
struct SnapshotState {
    board: BoardState,
    summary: WhiteboxSummary,
    control: ControlState,
}

#[derive(Debug, Clone, Default)]
struct SelectionState {
    selected_approval: usize,
    selected_gate_id: Option<String>,
}

#[derive(Debug, Clone)]
struct DetailState {
    explain_report: Option<ExplainReport>,
    current_approval: Option<PendingApproval>,
    pending_request: Option<ExplainRequest>,
    active_request_id: Option<u64>,
    next_request_id: u64,
}

impl Default for DetailState {
    fn default() -> Self {
        Self {
            explain_report: None,
            current_approval: None,
            pending_request: None,
            active_request_id: None,
            next_request_id: 1,
        }
    }
}

#[derive(Debug, Clone)]
struct TransientState {
    last_action: String,
    optimistic_action: Option<OptimisticAction>,
    recent_highlight: Option<RecentHighlight>,
    pending_submit: Option<SubmitRequest>,
    active_submit: Option<SubmitRequest>,
    next_submit_request_id: u64,
    quit_requested: bool,
}

#[derive(Debug, Clone)]
struct RecentHighlight {
    task_id: String,
    label: String,
    until_at: Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum ViewMode {
    #[default]
    Board,
    Detail,
}

#[derive(Debug, Clone, Default)]
struct ViewState {
    mode: ViewMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OptimisticPhase {
    Submitting,
    Submitted,
    PartialSuccess,
    Confirmed,
    Failed,
}

#[derive(Debug, Clone)]
struct OptimisticAction {
    gate_id: String,
    task_id: Option<String>,
    action: String,
    phase: OptimisticPhase,
    deadline_at: Duration,
}

#[derive(Debug, Clone)]
struct SubmitRequest {
    request_id: u64,
    gate_id: String,
    action: String,
}

#[derive(Debug, Clone)]
struct ExplainRequest {
    request_id: u64,
    approval: PendingApproval,
}

#[derive(Debug, Clone)]
struct SubmitResult {
    request_id: u64,
    gate_id: String,
    action: String,
    outcome: SubmitOutcome,
}

#[derive(Debug, Clone)]
struct ExplainResult {
    request_id: u64,
    approval: PendingApproval,
    report: Option<ExplainReport>,
}

#[derive(Debug, Clone)]
enum SubmitOutcome {
    Submitted,
    PartialSuccess(String),
    Failed(String),
}

struct SubmitController {
    active: Option<ActiveSubmitWorker>,
}

struct ExplainController {
    sender: mpsc::Sender<ExplainResult>,
    receiver: mpsc::Receiver<ExplainResult>,
}

struct ActiveSubmitWorker {
    request: SubmitRequest,
    started_at: Duration,
    receiver: mpsc::Receiver<SubmitResult>,
}

#[derive(Debug, Clone)]
enum AppEvent {
    ReloadRequested(Duration),
    Tick(Duration),
    MoveSelection(isize),
    EnterDetail,
    BackToBoard,
    ApproveSelected(Duration),
    RejectSelected(Duration),
    SubmitFinished(SubmitResult),
    ExplainFinished(ExplainResult),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LayoutMode {
    Wide,
    Narrow,
}

#[derive(Debug)]
struct ReloadDebounce {
    debounce_window: Duration,
    pending: bool,
    last_change_at: Option<Duration>,
}

impl ReloadDebounce {
    fn new(debounce_window: Duration) -> Self {
        Self {
            debounce_window,
            pending: false,
            last_change_at: None,
        }
    }

    fn mark_changed(&mut self, now: Duration) {
        self.pending = true;
        self.last_change_at = Some(now);
    }

    fn take_ready(&mut self, now: Duration) -> bool {
        if !self.pending {
            return false;
        }

        if let Some(last_change_at) = self.last_change_at {
            if now.saturating_sub(last_change_at) >= self.debounce_window {
                self.pending = false;
                self.last_change_at = None;
                return true;
            }
        }

        false
    }
}

struct ArtifactWatcher {
    _watcher: RecommendedWatcher,
    receiver: mpsc::Receiver<notify::Result<NotifyEvent>>,
    watched_files: Vec<PathBuf>,
    registered_files: Vec<PathBuf>,
    debounce: ReloadDebounce,
}

#[derive(Debug, Clone, Copy, Default)]
struct CliOptions {
    snapshot: bool,
}

fn parse_cli() -> (PathBuf, CliOptions) {
    let mut project_dir = std::env::var("CLAUDE_PROJECT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let mut options = CliOptions::default();
    let mut args = std::env::args().skip(1);

    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--project-dir=") {
            project_dir = PathBuf::from(value);
        } else if arg == "--project-dir" {
            if let Some(value) = args.next() {
                project_dir = PathBuf::from(value);
            }
        } else if arg == "--snapshot" {
            options.snapshot = true;
        }
    }

    (project_dir, options)
}

fn read_json_or_default<T>(path: &Path) -> T
where
    T: for<'de> Deserialize<'de> + Default,
{
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<T>(&raw).ok())
        .unwrap_or_default()
}

fn watched_artifact_paths(project_dir: &Path) -> Vec<PathBuf> {
    vec![
        project_dir.join(".claude/collab/board-state.json"),
        project_dir.join(".claude/collab/control-state.json"),
        project_dir.join(".claude/collab/whitebox-summary.json"),
    ]
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn touches_watched_file(event: &NotifyEvent, watched_files: &[PathBuf]) -> bool {
    event
        .paths
        .iter()
        .map(|path| normalize_path(path))
        .any(|path| {
            watched_files
                .iter()
                .any(|watched_path| path == *watched_path)
        })
}

impl ArtifactWatcher {
    fn new(project_dir: &Path) -> notify::Result<Self> {
        let watched_files: Vec<PathBuf> = watched_artifact_paths(project_dir)
            .into_iter()
            .map(|path| normalize_path(&path))
            .collect();
        let (sender, receiver) = mpsc::channel();
        let watcher = notify::recommended_watcher(move |result| {
            let _ = sender.send(result);
        })?;

        let mut artifact_watcher = Self {
            _watcher: watcher,
            receiver,
            watched_files,
            registered_files: Vec::new(),
            debounce: ReloadDebounce::new(WATCH_DEBOUNCE),
        };
        artifact_watcher.refresh_registrations()?;
        Ok(artifact_watcher)
    }

    fn refresh_registrations(&mut self) -> notify::Result<()> {
        for watched_file in &self.watched_files {
            if watched_file.exists()
                && !self
                    .registered_files
                    .iter()
                    .any(|path| path == watched_file)
            {
                self._watcher
                    .watch(watched_file, RecursiveMode::NonRecursive)?;
                self.registered_files.push(watched_file.clone());
            }
        }
        Ok(())
    }

    fn take_reload_signal(&mut self, now: Duration) -> bool {
        let _ = self.refresh_registrations();
        loop {
            match self.receiver.try_recv() {
                Ok(Ok(event)) => {
                    if touches_watched_file(&event, &self.watched_files) {
                        self.debounce.mark_changed(now);
                    }
                }
                Ok(Err(_)) => {}
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => break,
            }
        }

        self.debounce.take_ready(now)
    }
}

impl SubmitController {
    fn new() -> Self {
        Self { active: None }
    }

    fn running(&self) -> bool {
        self.active.is_some()
    }

    fn dispatch(&mut self, now: Duration, project_dir: PathBuf, request: SubmitRequest) {
        let (sender, receiver) = mpsc::channel();
        self.active = Some(ActiveSubmitWorker {
            request: request.clone(),
            started_at: now,
            receiver,
        });
        thread::spawn(move || {
            let result = execute_submit_request(&project_dir, &request);
            let _ = sender.send(result);
        });
    }

    fn take_result(&mut self, now: Duration) -> Option<SubmitResult> {
        let state = self.active.as_mut()?;
        if now.saturating_sub(state.started_at) >= SUBMIT_WORK_TIMEOUT {
            let request = self.active.take()?.request;
            return Some(SubmitResult {
                request_id: request.request_id,
                gate_id: request.gate_id.clone(),
                action: request.action.clone(),
                outcome: SubmitOutcome::Failed(format!(
                    "{} timed out for {}",
                    request.action, request.gate_id
                )),
            });
        }

        match state.receiver.try_recv() {
            Ok(result) => {
                self.active = None;
                Some(result)
            }
            Err(mpsc::TryRecvError::Empty) => None,
            Err(mpsc::TryRecvError::Disconnected) => {
                let request = self.active.take()?.request;
                Some(SubmitResult {
                    request_id: request.request_id,
                    gate_id: request.gate_id.clone(),
                    action: request.action.clone(),
                    outcome: SubmitOutcome::Failed(format!(
                        "{} worker disconnected for {}",
                        request.action, request.gate_id
                    )),
                })
            }
        }
    }
}

impl ExplainController {
    fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        Self { sender, receiver }
    }

    fn dispatch(&self, project_dir: PathBuf, request: ExplainRequest) {
        let sender = self.sender.clone();
        thread::spawn(move || {
            let report = fetch_explain_report(&project_dir, Some(&request.approval));
            let _ = sender.send(ExplainResult {
                request_id: request.request_id,
                approval: request.approval,
                report,
            });
        });
    }

    fn drain_results(&self) -> Vec<ExplainResult> {
        let mut results = Vec::new();
        loop {
            match self.receiver.try_recv() {
                Ok(result) => results.push(result),
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => break,
            }
        }
        results
    }
}

fn load_snapshot(project_dir: &Path) -> SnapshotState {
    let board =
        read_json_or_default::<BoardState>(&project_dir.join(".claude/collab/board-state.json"));
    let summary = read_json_or_default::<WhiteboxSummary>(
        &project_dir.join(".claude/collab/whitebox-summary.json"),
    );
    let control = read_json_or_default::<ControlState>(
        &project_dir.join(".claude/collab/control-state.json"),
    );

    SnapshotState {
        board,
        summary,
        control,
    }
}

fn clamp_selection(selection: usize, control: &ControlState) -> usize {
    if control.pending_approvals.is_empty() {
        0
    } else {
        selection.min(control.pending_approvals.len().saturating_sub(1))
    }
}

fn load_app(project_dir: PathBuf) -> App {
    let snapshot = load_snapshot(&project_dir);
    let mut app = App {
        snapshot,
        selection: SelectionState::default(),
        detail: DetailState::default(),
        transient: TransientState {
            last_action:
                "Use j/k or arrows to select an approval, a to approve, r to reject, q to quit."
                    .to_string(),
            optimistic_action: None,
            recent_highlight: None,
            pending_submit: None,
            active_submit: None,
            next_submit_request_id: 1,
            quit_requested: false,
        },
        view: ViewState::default(),
        project_dir,
    };
    restore_selection_by_gate(&mut app.selection, &app.snapshot.control);
    refresh_explain_detail(&mut app);
    app
}

fn submit_active(app: &App) -> bool {
    app.transient
        .optimistic_action
        .as_ref()
        .is_some_and(|action| {
            matches!(
                action.phase,
                OptimisticPhase::Submitting | OptimisticPhase::Submitted
            )
        })
}

fn submit_work_pending(app: &App, submit_controller: &SubmitController) -> bool {
    app.transient.pending_submit.is_some()
        || app.transient.active_submit.is_some()
        || submit_controller.running()
}

fn request_quit(app: &mut App, submit_controller: &SubmitController) -> bool {
    if submit_work_pending(app, submit_controller) {
        if app.transient.quit_requested {
            app.transient.last_action =
                "force quit requested; leaving while control submit is still running".to_string();
            return true;
        }
        app.transient.quit_requested = true;
        app.transient.last_action =
            "quit requested; waiting for control submit to finish (press q again to force quit)"
                .to_string();
        false
    } else {
        true
    }
}

fn quit_ready(app: &App, submit_controller: &SubmitController) -> bool {
    app.transient.quit_requested && !submit_work_pending(app, submit_controller)
}

fn command_failure_message(action: &str, gate_id: &str, output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        stdout
    } else if !stderr.is_empty() {
        stderr
    } else {
        format!("{} failed for {}", action, gate_id)
    }
}

fn rebuild_failure_message(script: &str, output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        format!("{script} rebuild failed: {stdout}")
    } else if !stderr.is_empty() {
        format!("{script} rebuild failed: {stderr}")
    } else {
        format!("{script} rebuild failed")
    }
}

fn partial_success_message(action: &str, gate_id: &str, detail: &str) -> String {
    format!(
        "{action} {gate_id} applied, but follow-up rebuild failed: {detail}. Control state already changed; refresh artifacts before retrying."
    )
}

fn execute_submit_request(project_dir: &Path, request: &SubmitRequest) -> SubmitResult {
    let control_output = Command::new("node")
        .arg(WHITEBOX_CONTROL_SCRIPT)
        .arg(&request.action)
        .arg(format!("--project-dir={}", project_dir.display()))
        .arg(format!("--gate-id={}", request.gate_id))
        .arg("--json")
        .output();

    let outcome = match control_output {
        Ok(output) if output.status.success() => {
            let rebuild_scripts = [
                ("whitebox-control-state.js", WHITEBOX_CONTROL_STATE_SCRIPT),
                ("whitebox-summary.js", WHITEBOX_SUMMARY_SCRIPT),
            ];
            let rebuild_failure = rebuild_scripts.iter().find_map(|script| {
                match Command::new("node")
                    .arg(script.1)
                    .arg(format!("--project-dir={}", project_dir.display()))
                    .output()
                {
                    Ok(result) if result.status.success() => None,
                    Ok(result) => Some(rebuild_failure_message(script.0, &result)),
                    Err(error) => Some(format!("{} unavailable: {}", script.0, error)),
                }
            });

            if let Some(message) = rebuild_failure {
                SubmitOutcome::PartialSuccess(partial_success_message(
                    &request.action,
                    &request.gate_id,
                    &message,
                ))
            } else {
                SubmitOutcome::Submitted
            }
        }
        Ok(output) => SubmitOutcome::Failed(command_failure_message(
            &request.action,
            &request.gate_id,
            &output,
        )),
        Err(error) => SubmitOutcome::Failed(format!("{} unavailable: {}", request.action, error)),
    };

    SubmitResult {
        request_id: request.request_id,
        gate_id: request.gate_id.clone(),
        action: request.action.clone(),
        outcome,
    }
}

fn next_submit_request_id(transient: &mut TransientState) -> u64 {
    let request_id = transient.next_submit_request_id;
    transient.next_submit_request_id = transient.next_submit_request_id.saturating_add(1);
    request_id
}

fn next_explain_request_id(detail: &mut DetailState) -> u64 {
    let request_id = detail.next_request_id;
    detail.next_request_id = detail.next_request_id.saturating_add(1);
    request_id
}

fn reload_app(app: &mut App, now: Duration) {
    app.snapshot = load_snapshot(&app.project_dir);
    restore_selection_by_gate(&mut app.selection, &app.snapshot.control);
    reconcile_optimistic_action(&mut app.transient, &app.snapshot.control, now, true);
    refresh_explain_detail(app);
}

fn restore_selection_by_gate(selection: &mut SelectionState, control: &ControlState) {
    if let Some(selected_gate_id) = selection.selected_gate_id.as_deref() {
        if let Some(idx) = control
            .pending_approvals
            .iter()
            .position(|approval| approval.gate_id == selected_gate_id)
        {
            selection.selected_approval = idx;
            return;
        }
    }

    selection.selected_approval = clamp_selection(selection.selected_approval, control);
    selection.selected_gate_id = control
        .pending_approvals
        .get(selection.selected_approval)
        .map(|approval| approval.gate_id.clone());
}

fn update_selected_gate(selection: &mut SelectionState, control: &ControlState) {
    selection.selected_gate_id = control
        .pending_approvals
        .get(selection.selected_approval)
        .map(|approval| approval.gate_id.clone());
}

fn optimistic_phase_label(phase: OptimisticPhase) -> &'static str {
    match phase {
        OptimisticPhase::Submitting => "submitting",
        OptimisticPhase::Submitted => "submitted",
        OptimisticPhase::PartialSuccess => "partial success",
        OptimisticPhase::Confirmed => "confirmed",
        OptimisticPhase::Failed => "failed",
    }
}

fn reconcile_optimistic_action(
    transient: &mut TransientState,
    control: &ControlState,
    now: Duration,
    on_reload: bool,
) {
    let Some(optimistic_action) = transient.optimistic_action.as_mut() else {
        return;
    };

    if on_reload
        && matches!(
            optimistic_action.phase,
            OptimisticPhase::Submitted | OptimisticPhase::PartialSuccess
        )
    {
        let still_pending = control
            .pending_approvals
            .iter()
            .any(|approval| approval.gate_id == optimistic_action.gate_id);

        if !still_pending {
            optimistic_action.phase = OptimisticPhase::Confirmed;
            transient.last_action = format!(
                "{} {} confirmed",
                optimistic_action.action, optimistic_action.gate_id
            );
            if let Some(task_id) = optimistic_action.task_id.clone() {
                transient.recent_highlight = Some(RecentHighlight {
                    task_id,
                    label: "recent confirm".to_string(),
                    until_at: now + Duration::from_secs(5),
                });
            }
            return;
        }
    }

    if matches!(
        optimistic_action.phase,
        OptimisticPhase::Submitting | OptimisticPhase::Submitted
    ) && now >= optimistic_action.deadline_at
    {
        optimistic_action.phase = OptimisticPhase::Failed;
        transient.last_action = format!(
            "{} {} timed out waiting for confirmation",
            optimistic_action.action, optimistic_action.gate_id
        );
        if let Some(task_id) = optimistic_action.task_id.clone() {
            transient.recent_highlight = Some(RecentHighlight {
                task_id,
                label: "recent failure".to_string(),
                until_at: now + Duration::from_secs(5),
            });
        }
    }
}

fn clear_expired_highlight(transient: &mut TransientState, now: Duration) {
    if transient
        .recent_highlight
        .as_ref()
        .is_some_and(|highlight| now >= highlight.until_at)
    {
        transient.recent_highlight = None;
    }
}

fn selected_approval<'a>(app: &'a App) -> Option<&'a PendingApproval> {
    app.snapshot
        .control
        .pending_approvals
        .get(app.selection.selected_approval)
}

fn fetch_explain_report(
    project_dir: &Path,
    approval: Option<&PendingApproval>,
) -> Option<ExplainReport> {
    let approval = approval?;
    let mut command = Command::new("node");
    command
        .arg(WHITEBOX_EXPLAIN_SCRIPT)
        .arg("--json")
        .arg(format!("--project-dir={}", project_dir.display()));

    if let Some(task_id) = approval.task_id.as_ref().filter(|value| !value.is_empty()) {
        command.arg(format!("--task-id={task_id}"));
    } else if !approval.gate_id.is_empty() {
        command.arg(format!("--gate={}", approval.gate_id));
    }

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    serde_json::from_slice::<ExplainReport>(&output.stdout).ok()
}

fn refresh_explain_detail(app: &mut App) {
    let Some(selected) = selected_approval(app).cloned() else {
        app.detail.explain_report = None;
        app.detail.current_approval = None;
        app.detail.pending_request = None;
        app.detail.active_request_id = None;
        return;
    };

    let context_changed = app.detail.current_approval.as_ref() != Some(&selected);
    let request_id = next_explain_request_id(&mut app.detail);
    if context_changed {
        app.detail.explain_report = None;
    }
    app.detail.current_approval = Some(selected.clone());
    app.detail.active_request_id = Some(request_id);
    app.detail.pending_request = Some(ExplainRequest {
        request_id,
        approval: selected,
    });
}

fn hydrate_explain_detail_for_snapshot(app: &mut App) {
    let approval = app
        .detail
        .pending_request
        .take()
        .map(|request| request.approval)
        .or_else(|| app.detail.current_approval.clone());
    app.detail.active_request_id = None;
    app.detail.explain_report = fetch_explain_report(&app.project_dir, approval.as_ref());
}

fn approval_detail_text(
    selected: Option<&PendingApproval>,
    report: Option<&ExplainReport>,
) -> Vec<String> {
    let Some(approval) = selected else {
        return vec![
            "No pending approvals.".to_string(),
            "This snapshot still shows the MVP key hints.".to_string(),
        ];
    };

    let Some(report) = report else {
        let evidence = if approval.evidence_paths.is_empty() {
            "none".to_string()
        } else {
            approval.evidence_paths.join(", ")
        };
        return vec![
            format!(
                "{}",
                approval
                    .task_id
                    .clone()
                    .unwrap_or_else(|| approval.gate_id.clone())
            ),
            format!(
                "created {}",
                approval.created_at.as_deref().unwrap_or("unknown")
            ),
            format!(
                "corr {}",
                approval.correlation_id.as_deref().unwrap_or("none")
            ),
            format!(
                "preview {}",
                if approval.preview.is_empty() {
                    "none"
                } else {
                    approval.preview.as_str()
                }
            ),
            format!("evidence {}", evidence),
            "Explain details unavailable. Awaiting evidence-backed detail output.".to_string(),
        ];
    };

    let mut lines = vec![format!(
        "{}:{}",
        if report.target.target_type.is_empty() {
            "target"
        } else {
            report.target.target_type.as_str()
        },
        if report.target.id.is_empty() {
            approval
                .task_id
                .as_deref()
                .unwrap_or(approval.gate_id.as_str())
        } else {
            report.target.id.as_str()
        }
    )];

    lines.push(format!(
        "reason {}",
        report.reason.clone().unwrap_or_else(|| "none".to_string())
    ));
    lines.push(format!(
        "source {}",
        report
            .source
            .clone()
            .unwrap_or_else(|| "unknown".to_string())
    ));
    lines.push(format!(
        "remediation {}",
        report
            .remediation
            .clone()
            .unwrap_or_else(|| "none".to_string())
    ));

    if report.ok {
        let evidence = if report.evidence_paths.is_empty() {
            "none".to_string()
        } else {
            report.evidence_paths.join(", ")
        };
        lines.push(format!("evidence {}", evidence));
    } else {
        lines.push("No explain evidence available. Read-only view.".to_string());
    }

    if let Some(run_id) = &report.correlation.run_id {
        lines.push(format!("run {}", run_id));
    }
    if let Some(last_event_type) = &report.correlation.last_event_type {
        lines.push(format!("event {}", last_event_type));
    }
    if let Some(last_event_ts) = &report.correlation.last_event_ts {
        lines.push(format!("event_ts {}", last_event_ts));
    }
    if let Some(event_id) = &report.correlation.event_id {
        lines.push(format!("event_id {}", event_id));
    }

    if report.options.is_empty() {
        lines.push("options none".to_string());
    } else {
        for option in &report.options {
            if !option.command.is_empty() {
                lines.push(format!("option {}", option.command));
            }
            if !option.effect.is_empty() {
                lines.push(format!("effect {}", option.effect));
            }
            if !option.risk.is_empty() {
                lines.push(format!("risk {}", option.risk));
            }
        }
    }

    lines
}

fn column_cards<'a>(app: &'a App, name: &str) -> &'a [Card] {
    app.snapshot
        .board
        .columns
        .get(name)
        .map(|cards| cards.as_slice())
        .unwrap_or(&[])
}

fn status_color(status: &str) -> Color {
    match status {
        "blocked" => Color::LightRed,
        "stale" => Color::Yellow,
        "approval_required" => Color::Yellow,
        "running" => Color::LightBlue,
        "clear" => Color::LightGreen,
        _ => Color::Gray,
    }
}

fn column_status_cue(column: &str) -> (&'static str, &'static str) {
    match column {
        "Backlog" => ("[B]", "queued"),
        "In Progress" => ("[~]", "active"),
        "Blocked" => ("[!]", "blocked"),
        "Done" => ("[x]", "done"),
        _ => ("[-]", "unknown"),
    }
}

fn layout_mode(width: u16) -> LayoutMode {
    if width < NARROW_WIDTH_THRESHOLD {
        LayoutMode::Narrow
    } else {
        LayoutMode::Wide
    }
}

fn card_lines(card: &Card, column: &str) -> Vec<Line<'static>> {
    let (icon, status) = column_status_cue(column);
    let mut lines = vec![Line::from(Span::styled(
        format!(
            "{} {}{}",
            icon,
            card.id,
            card.agent
                .as_ref()
                .map(|agent| format!(" [{agent}]"))
                .unwrap_or_default()
        ),
        Style::default().add_modifier(Modifier::BOLD),
    ))];

    if !card.title.is_empty() && card.title != card.id {
        lines.push(Line::from(card.title.clone()));
    } else {
        lines.push(Line::from(format!("status {}", status)));
    }

    if column == "Blocked" {
        if let Some(reason) = &card.blocker_reason {
            lines.push(Line::from(Span::styled(
                reason.clone(),
                Style::default().fg(Color::LightRed),
            )));
        }
    }

    if lines.len() > 3 {
        lines.truncate(3);
    }
    lines
}

fn selected_style(selected: bool) -> Style {
    if selected {
        Style::default()
            .fg(Color::Black)
            .bg(Color::Cyan)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
    }
}

fn pending_approval_task_ids(app: &App) -> Vec<&str> {
    app.snapshot
        .control
        .pending_approvals
        .iter()
        .filter_map(|approval| approval.task_id.as_deref())
        .collect()
}

fn recent_highlight_label<'a>(app: &'a App, card_id: &str) -> Option<&'a str> {
    app.transient
        .recent_highlight
        .as_ref()
        .and_then(|highlight| (highlight.task_id == card_id).then_some(highlight.label.as_str()))
}

fn detail_has_actions(app: &App) -> bool {
    app.detail
        .explain_report
        .as_ref()
        .is_some_and(|report| !report.options.is_empty())
}

fn render_header(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let run = app
        .snapshot
        .summary
        .run_id_short
        .clone()
        .unwrap_or_else(|| "none".to_string());
    let phase = app
        .snapshot
        .summary
        .tasks
        .current_phase
        .clone()
        .unwrap_or_else(|| "No active phase".to_string());
    let next_task = app
        .snapshot
        .summary
        .tasks
        .next_task
        .clone()
        .unwrap_or_else(|| "none".to_string());
    let next = app
        .snapshot
        .summary
        .next_remediation_target
        .as_ref()
        .map(|next| format!("{} - {}", next.id, next.reason))
        .unwrap_or_else(|| "No remediation pending".to_string());

    let lines = vec![
        Line::from(vec![
            Span::styled(
                "Whitebox Control Plane",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::styled(
                format!("gate={}", app.snapshot.summary.gate_status),
                Style::default()
                    .fg(status_color(&app.snapshot.summary.gate_status))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::raw(format!("blocked={}", app.snapshot.summary.blocked_count)),
            Span::raw("  "),
            Span::raw(format!(
                "approvals={}",
                app.snapshot
                    .summary
                    .pending_approval_count
                    .max(app.snapshot.control.pending_approval_count)
            )),
            Span::raw("  "),
            Span::raw(format!(
                "stale={}",
                app.snapshot.summary.stale_artifact_count
            )),
            Span::raw("  "),
            Span::raw(format!("run={run}")),
        ]),
        Line::from(format!(
            "tasks {}/{}  |  phase {}  |  next task {}  |  next {}",
            app.snapshot.summary.tasks.done,
            app.snapshot.summary.tasks.total,
            phase,
            next_task,
            next
        )),
    ];

    let widget = Paragraph::new(lines)
        .block(Block::default().title("Status").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(widget, area);
}

fn render_column(app: &App, area: Rect, frame: &mut ratatui::Frame, column: &str) {
    let pending_tasks = pending_approval_task_ids(app);
    let items: Vec<ListItem> = column_cards(app, column)
        .iter()
        .map(|card| {
            let mut lines = card_lines(card, column);

            if pending_tasks.iter().any(|task_id| *task_id == card.id) && lines.len() < 3 {
                lines.push(Line::from(Span::styled(
                    "[approval] operator decision required",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                )));
            }

            if let Some(label) = recent_highlight_label(app, &card.id) {
                if lines.len() == 3 {
                    lines.pop();
                }
                lines.push(Line::from(Span::styled(
                    format!("[{label}]"),
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )));
            }

            ListItem::new(lines)
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .title(format!("{} ({})", column, column_cards(app, column).len()))
            .borders(Borders::ALL),
    );

    frame.render_widget(list, area);
}

fn render_compact_board(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let mut items: Vec<ListItem> = Vec::new();
    let pending_tasks = pending_approval_task_ids(app);

    for column in COLUMN_ORDER {
        let cards = column_cards(app, column);
        let (icon, _) = column_status_cue(column);
        items.push(ListItem::new(Line::from(Span::styled(
            format!("{} {} ({})", icon, column, cards.len()),
            Style::default().add_modifier(Modifier::BOLD),
        ))));

        if cards.is_empty() {
            items.push(ListItem::new(Line::from("  - none")));
            continue;
        }

        for card in cards {
            let mut lines = card_lines(card, column);

            if pending_tasks.iter().any(|task_id| *task_id == card.id) && lines.len() < 3 {
                lines.push(Line::from(Span::styled(
                    "[approval] operator decision required",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                )));
            }

            if let Some(label) = recent_highlight_label(app, &card.id) {
                if lines.len() == 3 {
                    lines.pop();
                }
                lines.push(Line::from(Span::styled(
                    format!("[{label}]"),
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )));
            }

            let lines = lines
                .into_iter()
                .enumerate()
                .map(|(idx, line)| {
                    if idx == 0 {
                        Line::from(format!("  {}", line))
                    } else {
                        Line::from(format!("    {}", line))
                    }
                })
                .collect::<Vec<Line>>();
            items.push(ListItem::new(lines));
        }
    }

    let list = List::new(items).block(
        Block::default()
            .title("Board (compact)")
            .borders(Borders::ALL),
    );
    frame.render_widget(list, area);
}

fn render_approvals(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let selected_gate = selected_approval(app)
        .map(|approval| approval.gate_id.clone())
        .unwrap_or_default();
    let items: Vec<ListItem> = app
        .snapshot
        .control
        .pending_approvals
        .iter()
        .enumerate()
        .map(|(idx, approval)| {
            let label = approval
                .task_id
                .clone()
                .or_else(|| approval.gate_name.clone())
                .unwrap_or_else(|| approval.gate_id.clone());
            let prefix = if idx == app.selection.selected_approval {
                ">"
            } else {
                " "
            };
            ListItem::new(Line::from(Span::styled(
                format!("{prefix} {}", label),
                selected_style(idx == app.selection.selected_approval),
            )))
        })
        .collect();

    let selected = selected_approval(app);
    let detail_lines: Vec<Line> =
        approval_detail_text(selected, app.detail.explain_report.as_ref())
            .into_iter()
            .enumerate()
            .map(|(idx, text)| {
                if idx == 0 {
                    Line::from(Span::styled(
                        text,
                        Style::default().add_modifier(Modifier::BOLD),
                    ))
                } else {
                    Line::from(text)
                }
            })
            .collect();

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(8), Constraint::Min(8)])
        .split(area);

    let list = List::new(items).block(
        Block::default()
            .title(format!(
                "Approvals ({})",
                app.snapshot.control.pending_approval_count
            ))
            .borders(Borders::ALL)
            .border_style(if selected_gate.is_empty() {
                Style::default()
            } else {
                Style::default().fg(Color::Cyan)
            }),
    );
    frame.render_widget(list, chunks[0]);

    let details = Paragraph::new(detail_lines)
        .block(
            Block::default()
                .title("Approval Details")
                .borders(Borders::ALL),
        )
        .wrap(Wrap { trim: true });
    frame.render_widget(details, chunks[1]);
}

fn render_context_pane(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let selected = selected_approval(app);
    let mut preview_lines: Vec<Line> =
        approval_detail_text(selected, app.detail.explain_report.as_ref())
            .into_iter()
            .take(7)
            .enumerate()
            .map(|(idx, text)| {
                if idx == 0 {
                    Line::from(Span::styled(
                        text,
                        Style::default().add_modifier(Modifier::BOLD),
                    ))
                } else {
                    Line::from(text)
                }
            })
            .collect();
    preview_lines.push(Line::from("Enter opens detail mode"));

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(8), Constraint::Min(8)])
        .split(area);

    let approval_items: Vec<ListItem> = app
        .snapshot
        .control
        .pending_approvals
        .iter()
        .enumerate()
        .map(|(idx, approval)| {
            let label = approval
                .task_id
                .clone()
                .or_else(|| approval.gate_name.clone())
                .unwrap_or_else(|| approval.gate_id.clone());
            let prefix = if idx == app.selection.selected_approval {
                ">"
            } else {
                " "
            };
            ListItem::new(Line::from(Span::styled(
                format!("{prefix} {}", label),
                selected_style(idx == app.selection.selected_approval),
            )))
        })
        .collect();

    let queue = List::new(approval_items).block(
        Block::default()
            .title(format!(
                "Approval Queue ({})",
                app.snapshot.control.pending_approval_count
            ))
            .borders(Borders::ALL),
    );
    frame.render_widget(queue, chunks[0]);

    let preview = Paragraph::new(preview_lines)
        .block(
            Block::default()
                .title("Context Preview")
                .borders(Borders::ALL),
        )
        .wrap(Wrap { trim: true });
    frame.render_widget(preview, chunks[1]);
}

fn render_detail_mode(app: &App, area: Rect, frame: &mut ratatui::Frame, mode: LayoutMode) {
    let detail_hint = if detail_has_actions(app) {
        "Approve/reject is available for this detail. q/Esc returns to the board."
    } else {
        "Read-only detail. No approve/reject options are available. q/Esc returns to the board."
    };
    match mode {
        LayoutMode::Wide => {
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(6), Constraint::Min(10)])
                .split(area);

            let banner = Paragraph::new(vec![
                Line::from(Span::styled(
                    "Detail Mode",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )),
                Line::from("Explain-backed evidence is rendered directly from whitebox JSON."),
                Line::from(detail_hint),
            ])
            .block(Block::default().title("Focus").borders(Borders::ALL))
            .wrap(Wrap { trim: true });
            frame.render_widget(banner, chunks[0]);
            render_approvals(app, chunks[1], frame);
        }
        LayoutMode::Narrow => {
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(9), Constraint::Min(10)])
                .split(area);

            let banner = Paragraph::new(vec![
                Line::from(Span::styled(
                    "Detail Mode",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )),
                Line::from("Review explain-backed evidence in focused detail mode."),
                Line::from(detail_hint),
            ])
            .block(Block::default().title("Focus").borders(Borders::ALL))
            .wrap(Wrap { trim: true });
            frame.render_widget(banner, chunks[0]);
            render_approvals(app, chunks[1], frame);
        }
    }
}

fn render_footer(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let remediation = app
        .snapshot
        .summary
        .next_remediation_target
        .as_ref()
        .map(|next| {
            if next.remediation.is_empty() {
                next.reason.clone()
            } else {
                next.remediation.clone()
            }
        })
        .unwrap_or_else(|| "Whitebox approval shell ready.".to_string());

    let mut text = vec![
        Line::from(format!("project {}", app.project_dir.display())),
        Line::from(remediation),
        Line::from(format!("action {}", app.transient.last_action)),
    ];
    if let Some(state) = app.transient.optimistic_action.as_ref() {
        text.push(Line::from(format!(
            "pending {} {} [{}]",
            state.action,
            state.gate_id,
            optimistic_phase_label(state.phase)
        )));
    }
    let key_hint = match app.view.mode {
        ViewMode::Board => match layout_mode(area.width) {
            LayoutMode::Wide => "keys j/k/arrows move  Enter detail  a approve  r reject  q quit",
            LayoutMode::Narrow => "keys j/k/arrows move  Enter detail  a approve  r reject  q quit",
        },
        ViewMode::Detail => {
            if detail_has_actions(app) {
                "keys j/k/arrows move  a approve  r reject  q/Esc board"
            } else {
                "keys j/k/arrows move  q/Esc board  read-only detail"
            }
        }
    };
    text.push(Line::from(Span::styled(
        key_hint,
        Style::default().fg(Color::DarkGray),
    )));

    let footer = Paragraph::new(text)
        .alignment(Alignment::Left)
        .block(Block::default().title("Whitebox").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(footer, area);
}

fn ui(frame: &mut ratatui::Frame, app: &App) {
    let mode = layout_mode(frame.size().width);
    let areas = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(12),
            Constraint::Length(6),
        ])
        .split(frame.size());

    render_header(app, areas[0], frame);

    match (mode, app.view.mode) {
        (LayoutMode::Wide, ViewMode::Board) => {
            let middle = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(68), Constraint::Percentage(32)])
                .split(areas[1]);

            let columns = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                ])
                .split(middle[0]);

            for (idx, column) in COLUMN_ORDER.iter().enumerate() {
                render_column(app, columns[idx], frame, column);
            }

            render_context_pane(app, middle[1], frame);
        }
        (LayoutMode::Wide, ViewMode::Detail) => {
            let middle = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(58), Constraint::Percentage(42)])
                .split(areas[1]);

            let columns = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                ])
                .split(middle[0]);

            for (idx, column) in COLUMN_ORDER.iter().enumerate() {
                render_column(app, columns[idx], frame, column);
            }

            render_detail_mode(app, middle[1], frame, mode);
        }
        (LayoutMode::Narrow, ViewMode::Board) => {
            render_compact_board(app, areas[1], frame);
        }
        (LayoutMode::Narrow, ViewMode::Detail) => {
            render_detail_mode(app, areas[1], frame, mode);
        }
    }

    render_footer(app, areas[2], frame);
}

fn apply_control(app: &mut App, action: &str, now: Duration) {
    if submit_active(app) {
        app.transient.last_action = "control submit already in flight".to_string();
        return;
    }

    let Some(approval) = selected_approval(app).cloned() else {
        app.transient.last_action = "No pending approval selected.".to_string();
        app.transient.optimistic_action = Some(OptimisticAction {
            gate_id: "none".to_string(),
            task_id: None,
            action: action.to_string(),
            phase: OptimisticPhase::Failed,
            deadline_at: now,
        });
        return;
    };

    app.transient.optimistic_action = Some(OptimisticAction {
        gate_id: approval.gate_id.clone(),
        task_id: approval.task_id.clone(),
        action: action.to_string(),
        phase: OptimisticPhase::Submitting,
        deadline_at: now + ACTION_CONFIRM_TIMEOUT,
    });
    let request_id = next_submit_request_id(&mut app.transient);
    app.transient.last_action = format!("{} {} submitting", action, approval.gate_id);
    app.transient.pending_submit = Some(SubmitRequest {
        request_id,
        gate_id: approval.gate_id,
        action: action.to_string(),
    });
}

fn handle_submit_result(app: &mut App, result: SubmitResult) {
    let Some(active_submit) = app.transient.active_submit.as_ref() else {
        return;
    };

    if active_submit.request_id != result.request_id {
        return;
    }

    app.transient.active_submit = None;

    if let Some(optimistic_action) = app.transient.optimistic_action.as_mut() {
        if optimistic_action.gate_id != result.gate_id || optimistic_action.action != result.action
        {
            return;
        }

        if optimistic_action.phase == OptimisticPhase::Failed {
            return;
        }

        match result.outcome {
            SubmitOutcome::Submitted => {
                optimistic_action.phase = OptimisticPhase::Submitted;
                app.transient.last_action = format!(
                    "{} {} submitted; awaiting reload confirmation",
                    result.action, result.gate_id
                );
            }
            SubmitOutcome::PartialSuccess(message) => {
                optimistic_action.phase = OptimisticPhase::PartialSuccess;
                app.transient.last_action = message;
            }
            SubmitOutcome::Failed(message) => {
                optimistic_action.phase = OptimisticPhase::Failed;
                app.transient.last_action = message;
            }
        }
    }
}

fn handle_explain_result(app: &mut App, result: ExplainResult) {
    if app.detail.active_request_id != Some(result.request_id) {
        return;
    }

    if app.detail.current_approval.as_ref() != Some(&result.approval) {
        return;
    }

    app.detail.active_request_id = None;
    app.detail.explain_report = result.report;
}

fn move_selection(app: &mut App, delta: isize) {
    let count = app.snapshot.control.pending_approvals.len();
    if count == 0 {
        app.selection.selected_approval = 0;
        return;
    }

    let current = app.selection.selected_approval as isize;
    let next = (current + delta).rem_euclid(count as isize);
    app.selection.selected_approval = next as usize;
    update_selected_gate(&mut app.selection, &app.snapshot.control);
    if app.view.mode == ViewMode::Detail {
        refresh_explain_detail(app);
    } else {
        app.detail.explain_report = None;
    }
}

fn update(app: &mut App, event: AppEvent) {
    match event {
        AppEvent::ReloadRequested(now) => reload_app(app, now),
        AppEvent::Tick(now) => {
            reconcile_optimistic_action(&mut app.transient, &app.snapshot.control, now, false);
            clear_expired_highlight(&mut app.transient, now);
        }
        AppEvent::MoveSelection(delta) => move_selection(app, delta),
        AppEvent::EnterDetail => {
            app.view.mode = ViewMode::Detail;
            refresh_explain_detail(app);
        }
        AppEvent::BackToBoard => app.view.mode = ViewMode::Board,
        AppEvent::ApproveSelected(now) => apply_control(app, "approve", now),
        AppEvent::RejectSelected(now) => apply_control(app, "reject", now),
        AppEvent::SubmitFinished(result) => handle_submit_result(app, result),
        AppEvent::ExplainFinished(result) => handle_explain_result(app, result),
    }
}

fn key_to_event(code: KeyCode, now: Duration) -> Option<AppEvent> {
    match code {
        KeyCode::Char('j') | KeyCode::Down => Some(AppEvent::MoveSelection(1)),
        KeyCode::Char('k') | KeyCode::Up => Some(AppEvent::MoveSelection(-1)),
        KeyCode::Enter => Some(AppEvent::EnterDetail),
        KeyCode::Char('a') => Some(AppEvent::ApproveSelected(now)),
        KeyCode::Char('r') => Some(AppEvent::RejectSelected(now)),
        _ => None,
    }
}

fn app_event_allowed(app: &App, event: &AppEvent) -> bool {
    match event {
        AppEvent::ApproveSelected(_) | AppEvent::RejectSelected(_) => {
            app.view.mode != ViewMode::Detail || detail_has_actions(app)
        }
        _ => true,
    }
}

fn run(mut app: App) -> Result<(), Box<dyn Error>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    let mut artifact_watcher = ArtifactWatcher::new(&app.project_dir).ok();
    let mut submit_controller = SubmitController::new();
    let explain_controller = ExplainController::new();
    let run_started_at = Instant::now();

    loop {
        let now = run_started_at.elapsed();
        update(&mut app, AppEvent::Tick(now));

        if !submit_controller.running() {
            if let Some(request) = app.transient.pending_submit.take() {
                app.transient.active_submit = Some(request.clone());
                submit_controller.dispatch(now, app.project_dir.clone(), request);
            }
        }

        if let Some(request) = app.detail.pending_request.take() {
            explain_controller.dispatch(app.project_dir.clone(), request);
        }

        if let Some(result) = submit_controller.take_result(now) {
            update(&mut app, AppEvent::SubmitFinished(result));
        }

        for result in explain_controller.drain_results() {
            update(&mut app, AppEvent::ExplainFinished(result));
        }

        if let Some(watcher) = artifact_watcher.as_mut() {
            if watcher.take_reload_signal(now) {
                update(&mut app, AppEvent::ReloadRequested(now));
            }
        }

        if quit_ready(&app, &submit_controller) {
            break;
        }

        terminal.draw(|frame| ui(frame, &app))?;
        if event::poll(Duration::from_millis(200))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc => {
                        if app.view.mode == ViewMode::Detail {
                            update(&mut app, AppEvent::BackToBoard);
                        } else {
                            if request_quit(&mut app, &submit_controller) {
                                break;
                            }
                        }
                    }
                    _ => {
                        if let Some(app_event) = key_to_event(key.code, now) {
                            if app_event_allowed(&app, &app_event) {
                                update(&mut app, app_event);
                            }
                        }
                    }
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

fn snapshot_with_size(app: App, width: u16, height: u16) -> Result<String, Box<dyn Error>> {
    let backend = TestBackend::new(width, height);
    let mut terminal = Terminal::new(backend)?;
    terminal.draw(|frame| ui(frame, &app))?;
    let buffer = terminal.backend().buffer();
    let area = buffer.area;
    let mut lines = Vec::new();

    for y in 0..area.height {
        let mut line = String::new();
        for x in 0..area.width {
            line.push_str(buffer.get(x, y).symbol());
        }
        lines.push(line.trim_end().to_string());
    }

    while matches!(lines.last(), Some(last) if last.is_empty()) {
        lines.pop();
    }

    Ok(lines.join("\n"))
}

fn snapshot(mut app: App) -> Result<String, Box<dyn Error>> {
    hydrate_explain_detail_for_snapshot(&mut app);
    snapshot_with_size(app, 160, 40)
}

fn main() -> Result<(), Box<dyn Error>> {
    let (project_dir, options) = parse_cli();
    let app = load_app(project_dir);

    if options.snapshot {
        println!("{}", snapshot(app)?);
        return Ok(());
    }

    let result = run(app);

    if disable_raw_mode().is_ok() {
        let mut stdout = io::stdout();
        let _ = execute!(stdout, LeaveAlternateScreen);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_project_dir(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    fn app_with_pending(count: usize) -> App {
        let pending_approvals = (0..count)
            .map(|idx| PendingApproval {
                gate_id: format!("gate-{idx}"),
                task_id: Some(format!("T{idx}")),
                ..Default::default()
            })
            .collect();
        App {
            snapshot: SnapshotState {
                board: BoardState::default(),
                summary: WhiteboxSummary::default(),
                control: ControlState {
                    pending_approval_count: count,
                    pending_approvals,
                },
            },
            selection: SelectionState::default(),
            detail: DetailState::default(),
            transient: TransientState {
                last_action: String::new(),
                optimistic_action: None,
                recent_highlight: None,
                pending_submit: None,
                active_submit: None,
                next_submit_request_id: 1,
                quit_requested: false,
            },
            view: ViewState::default(),
            project_dir: PathBuf::from("."),
        }
    }

    fn dispatch_pending_submit_for_test(app: &mut App) -> u64 {
        let request = app
            .transient
            .pending_submit
            .take()
            .expect("pending submit request");
        let request_id = request.request_id;
        app.transient.active_submit = Some(request);
        request_id
    }

    fn activate_pending_submit_for_test(app: &mut App) -> SubmitRequest {
        let request = app
            .transient
            .pending_submit
            .take()
            .expect("pending submit request");
        app.transient.active_submit = Some(request.clone());
        request
    }

    fn submit_controller_with_active_request(
        request: SubmitRequest,
        started_at: Duration,
    ) -> (SubmitController, mpsc::Sender<SubmitResult>) {
        let (sender, receiver) = mpsc::channel();
        let controller = SubmitController {
            active: Some(ActiveSubmitWorker {
                request,
                started_at,
                receiver,
            }),
        };
        (controller, sender)
    }

    #[test]
    fn tui_state_reducer_smoke() {
        let mut app = app_with_pending(3);

        update(&mut app, AppEvent::MoveSelection(1));
        assert_eq!(app.selection.selected_approval, 1);

        update(&mut app, AppEvent::MoveSelection(1));
        assert_eq!(app.selection.selected_approval, 2);

        update(&mut app, AppEvent::MoveSelection(1));
        assert_eq!(app.selection.selected_approval, 0);

        update(&mut app, AppEvent::MoveSelection(-1));
        assert_eq!(app.selection.selected_approval, 2);
    }

    #[test]
    fn explain_detail_uses_whitebox_json() {
        let approval = PendingApproval {
            gate_id: "gate-1".to_string(),
            task_id: Some("T1".to_string()),
            preview: "legacy preview that should not render".to_string(),
            evidence_paths: vec!["legacy-evidence".to_string()],
            ..Default::default()
        };
        let report: ExplainReport = serde_json::from_str(
            r#"{
              "ok": true,
              "target": {"type": "task", "id": "T1"},
              "reason": "Approval required for T1",
              "source": "whitebox-control-state",
              "remediation": "Choose approve or reject from the evidence-backed options.",
              "options": [
                {
                  "command": "node whitebox-control.js approve --gate-id=gate-1 --json",
                  "effect": "Records one approve command for the paused gate.",
                  "risk": "Execution continues with the currently proposed plan."
                }
              ],
              "evidence_paths": ["/tmp/.claude/collab/control-state.json"],
              "correlation": {"last_event_type": "execution_paused", "last_event_ts": "2026-03-08T12:00:00Z"}
            }"#,
        )
        .expect("valid explain report json");

        let lines = approval_detail_text(Some(&approval), Some(&report));

        assert!(lines
            .iter()
            .any(|line| line
                .contains("option node whitebox-control.js approve --gate-id=gate-1 --json")));
        assert!(lines
            .iter()
            .any(|line| line.contains("effect Records one approve command for the paused gate.")));
        assert!(lines.iter().any(
            |line| line.contains("risk Execution continues with the currently proposed plan.")
        ));
        assert!(lines
            .iter()
            .any(|line| line.contains("evidence /tmp/.claude/collab/control-state.json")));
        assert!(!lines.iter().any(|line| line.contains("legacy preview")));
    }

    #[test]
    fn watcher_reloads_only_whitebox_artifacts() {
        let project_dir = PathBuf::from("/tmp/project");
        let watched = watched_artifact_paths(&project_dir);

        let board_event = NotifyEvent {
            kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
            paths: vec![project_dir.join(".claude/collab/board-state.json")],
            attrs: notify::event::EventAttributes::new(),
        };
        assert!(touches_watched_file(&board_event, &watched));

        let control_event = NotifyEvent {
            kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
            paths: vec![project_dir.join(".claude/collab/control-state.json")],
            attrs: notify::event::EventAttributes::new(),
        };
        assert!(touches_watched_file(&control_event, &watched));

        let summary_event = NotifyEvent {
            kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
            paths: vec![project_dir.join(".claude/collab/whitebox-summary.json")],
            attrs: notify::event::EventAttributes::new(),
        };
        assert!(touches_watched_file(&summary_event, &watched));

        let ignored_event = NotifyEvent {
            kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
            paths: vec![project_dir.join(".claude/collab/events.ndjson")],
            attrs: notify::event::EventAttributes::new(),
        };
        assert!(!touches_watched_file(&ignored_event, &watched));
    }

    #[test]
    fn watcher_debounces_multi_file_refresh() {
        let mut debounce = ReloadDebounce::new(Duration::from_millis(250));

        debounce.mark_changed(Duration::from_millis(0));
        debounce.mark_changed(Duration::from_millis(40));
        debounce.mark_changed(Duration::from_millis(80));

        assert!(!debounce.take_ready(Duration::from_millis(200)));
        assert!(debounce.take_ready(Duration::from_millis(330)));
        assert!(!debounce.take_ready(Duration::from_millis(500)));
    }

    #[test]
    fn selected_gate_survives_reordered_reload() {
        let mut selection = SelectionState {
            selected_approval: 1,
            selected_gate_id: Some("gate-b".to_string()),
        };
        let reordered = ControlState {
            pending_approval_count: 3,
            pending_approvals: vec![
                PendingApproval {
                    gate_id: "gate-c".to_string(),
                    ..Default::default()
                },
                PendingApproval {
                    gate_id: "gate-a".to_string(),
                    ..Default::default()
                },
                PendingApproval {
                    gate_id: "gate-b".to_string(),
                    ..Default::default()
                },
            ],
        };

        restore_selection_by_gate(&mut selection, &reordered);

        assert_eq!(selection.selected_approval, 2);
        assert_eq!(selection.selected_gate_id.as_deref(), Some("gate-b"));
    }

    #[test]
    fn optimistic_action_transitions_reconcile_with_reload() {
        let mut transient = TransientState {
            last_action: String::new(),
            optimistic_action: Some(OptimisticAction {
                gate_id: "gate-1".to_string(),
                task_id: Some("T1".to_string()),
                action: "approve".to_string(),
                phase: OptimisticPhase::Submitted,
                deadline_at: Duration::from_secs(5),
            }),
            recent_highlight: None,
            pending_submit: None,
            active_submit: None,
            next_submit_request_id: 1,
            quit_requested: false,
        };
        let pending_control = ControlState {
            pending_approval_count: 1,
            pending_approvals: vec![PendingApproval {
                gate_id: "gate-1".to_string(),
                ..Default::default()
            }],
        };

        reconcile_optimistic_action(
            &mut transient,
            &pending_control,
            Duration::from_secs(1),
            true,
        );
        assert_eq!(
            transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitted)
        );

        let cleared_control = ControlState {
            pending_approval_count: 0,
            pending_approvals: vec![],
        };
        reconcile_optimistic_action(
            &mut transient,
            &cleared_control,
            Duration::from_secs(2),
            true,
        );
        assert_eq!(
            transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Confirmed)
        );

        let mut timeout_transient = TransientState {
            last_action: String::new(),
            optimistic_action: Some(OptimisticAction {
                gate_id: "gate-2".to_string(),
                task_id: Some("T2".to_string()),
                action: "reject".to_string(),
                phase: OptimisticPhase::Submitted,
                deadline_at: Duration::from_millis(300),
            }),
            recent_highlight: None,
            pending_submit: None,
            active_submit: None,
            next_submit_request_id: 1,
            quit_requested: false,
        };
        reconcile_optimistic_action(
            &mut timeout_transient,
            &pending_control,
            Duration::from_millis(350),
            false,
        );
        assert_eq!(
            timeout_transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Failed)
        );
    }

    #[test]
    fn narrow_width_falls_back_to_single_pane() {
        let mut app = app_with_pending(1);
        app.snapshot.board.columns.insert(
            "In Progress".to_string(),
            vec![Card {
                id: "T1.2".to_string(),
                title: "Implement reducer flow".to_string(),
                agent: Some("builder".to_string()),
                blocker_reason: None,
            }],
        );
        app.snapshot.control.pending_approval_count = 1;
        app.snapshot.control.pending_approvals = vec![PendingApproval {
            gate_id: "gate-1".to_string(),
            task_id: Some("T1.2".to_string()),
            ..Default::default()
        }];
        app.selection.selected_approval = 0;
        app.selection.selected_gate_id = Some("gate-1".to_string());

        let narrow = snapshot_with_size(app.clone(), 100, 40).expect("narrow snapshot renders");
        assert!(narrow.contains("Board (compact)"));
        assert!(!narrow.contains("Approval Queue (1)"));

        let wide = snapshot_with_size(app, 160, 40).expect("wide snapshot renders");
        assert!(!wide.contains("Board (compact)"));
        assert!(wide.contains("In Progress (1)"));
    }

    #[test]
    fn enter_opens_detail_and_escape_returns_to_board() {
        let mut app = app_with_pending(1);

        update(&mut app, AppEvent::EnterDetail);
        assert_eq!(app.view.mode, ViewMode::Detail);

        update(&mut app, AppEvent::BackToBoard);
        assert_eq!(app.view.mode, ViewMode::Board);
    }

    #[test]
    fn fixture_snapshot_renders_board_context_and_bottom_bar() {
        let app = load_app(fixture_project_dir("approval-required"));

        let snapshot = snapshot(app).expect("fixture snapshot renders");

        assert!(snapshot.contains("Backlog (1)"));
        assert!(snapshot.contains("Blocked (1)"));
        assert!(snapshot.contains("Approval Queue (1)"));
        assert!(snapshot.contains("Context Preview"));
        assert!(snapshot.contains("Enter detail"));
    }

    #[test]
    fn fixture_detail_snapshot_shows_focus_mode() {
        let mut app = load_app(fixture_project_dir("approval-required"));
        update(&mut app, AppEvent::EnterDetail);

        let snapshot = snapshot(app).expect("detail snapshot renders");

        assert!(snapshot.contains("Focus"));
        assert!(snapshot.contains("Detail Mode"));
        assert!(snapshot.contains("Approval Details"));
        assert!(snapshot.contains("Approve/reject is available for this detail."));
    }

    #[test]
    fn detail_without_options_is_read_only() {
        let mut app = app_with_pending(1);
        app.detail.current_approval = selected_approval(&app).cloned();
        app.detail.explain_report = Some(ExplainReport {
            ok: false,
            target: ExplainTarget {
                target_type: "task".to_string(),
                id: "T0".to_string(),
            },
            options: vec![],
            ..Default::default()
        });
        update(&mut app, AppEvent::EnterDetail);

        assert!(!detail_has_actions(&app));
        assert!(!app_event_allowed(
            &app,
            &AppEvent::ApproveSelected(Duration::from_secs(1))
        ));

        let snapshot = snapshot(app).expect("read-only detail snapshot renders");
        assert!(snapshot.contains("read-only detail"));
    }

    #[test]
    fn selection_change_drops_stale_explain_result() {
        let mut app = app_with_pending(2);

        update(&mut app, AppEvent::EnterDetail);
        let stale_request = app
            .detail
            .pending_request
            .clone()
            .expect("initial explain request");

        update(&mut app, AppEvent::MoveSelection(1));
        let active_request = app
            .detail
            .pending_request
            .clone()
            .expect("replacement explain request");

        assert_eq!(app.selection.selected_approval, 1);
        assert!(stale_request.request_id < active_request.request_id);

        update(
            &mut app,
            AppEvent::ExplainFinished(ExplainResult {
                request_id: stale_request.request_id,
                approval: stale_request.approval.clone(),
                report: Some(ExplainReport {
                    ok: true,
                    target: ExplainTarget {
                        target_type: "task".to_string(),
                        id: "T0".to_string(),
                    },
                    options: vec![ExplainOption {
                        command: "approve stale".to_string(),
                        effect: String::new(),
                        risk: String::new(),
                    }],
                    ..Default::default()
                }),
            }),
        );

        assert!(app.detail.explain_report.is_none());
        assert_eq!(
            app.detail.active_request_id,
            Some(active_request.request_id)
        );
        assert_eq!(
            app.detail.current_approval.as_ref(),
            Some(&active_request.approval)
        );

        update(
            &mut app,
            AppEvent::ExplainFinished(ExplainResult {
                request_id: active_request.request_id,
                approval: active_request.approval.clone(),
                report: Some(ExplainReport {
                    ok: true,
                    target: ExplainTarget {
                        target_type: "task".to_string(),
                        id: "T1".to_string(),
                    },
                    options: vec![ExplainOption {
                        command: "approve active".to_string(),
                        effect: String::new(),
                        risk: String::new(),
                    }],
                    ..Default::default()
                }),
            }),
        );

        assert_eq!(
            app.detail
                .explain_report
                .as_ref()
                .and_then(|report| report.options.first())
                .map(|option| option.command.as_str()),
            Some("approve active")
        );
        assert_eq!(app.detail.active_request_id, None);
    }

    #[test]
    fn detail_entry_remains_responsive_while_explain_loads() {
        let mut app = app_with_pending(2);

        update(&mut app, AppEvent::EnterDetail);
        let first_request = app
            .detail
            .pending_request
            .clone()
            .expect("detail entry queues explain request");

        assert_eq!(app.view.mode, ViewMode::Detail);
        assert!(app.detail.explain_report.is_none());
        assert_eq!(app.detail.active_request_id, Some(first_request.request_id));

        update(&mut app, AppEvent::MoveSelection(1));
        let second_request = app
            .detail
            .pending_request
            .clone()
            .expect("selection change queues replacement explain request");

        assert_eq!(app.selection.selected_approval, 1);
        assert!(second_request.request_id > first_request.request_id);
        assert_eq!(
            app.detail.active_request_id,
            Some(second_request.request_id)
        );
        assert_eq!(
            app.detail.current_approval.as_ref(),
            Some(&second_request.approval)
        );
        assert!(app.detail.explain_report.is_none());
    }

    #[test]
    fn recent_highlight_marks_updated_card() {
        let mut app = app_with_pending(1);
        app.snapshot.board.columns.insert(
            "In Progress".to_string(),
            vec![Card {
                id: "T0".to_string(),
                title: "Test recent highlight".to_string(),
                agent: Some("builder".to_string()),
                blocker_reason: None,
            }],
        );
        app.transient.recent_highlight = Some(RecentHighlight {
            task_id: "T0".to_string(),
            label: "recent confirm".to_string(),
            until_at: Duration::from_secs(5),
        });

        let snapshot = snapshot(app).expect("highlight snapshot renders");
        assert!(snapshot.contains("[recent confirm]"));
    }

    #[test]
    fn control_submit_is_non_blocking_and_processes_followup_events() {
        let mut app = app_with_pending(2);

        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(10)),
        );
        assert!(app.transient.pending_submit.is_some());
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitting)
        );

        update(&mut app, AppEvent::MoveSelection(1));
        assert_eq!(app.selection.selected_approval, 1);

        let request_id = dispatch_pending_submit_for_test(&mut app);

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitted)
        );
    }

    #[test]
    fn duplicate_submit_is_ignored_while_in_flight() {
        let mut app = app_with_pending(1);

        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(10)),
        );
        let queued = app.transient.pending_submit.clone();

        update(
            &mut app,
            AppEvent::RejectSelected(Duration::from_millis(20)),
        );

        assert_eq!(
            app.transient
                .pending_submit
                .as_ref()
                .map(|req| req.action.as_str()),
            queued.as_ref().map(|req| req.action.as_str())
        );
        assert_eq!(
            app.transient.last_action,
            "control submit already in flight"
        );
    }

    #[test]
    fn stale_submit_result_is_ignored_for_newer_request() {
        let mut app = app_with_pending(1);
        app.transient.optimistic_action = Some(OptimisticAction {
            gate_id: "gate-new".to_string(),
            task_id: Some("T-new".to_string()),
            action: "approve".to_string(),
            phase: OptimisticPhase::Submitting,
            deadline_at: Duration::from_secs(5),
        });
        app.transient.active_submit = Some(SubmitRequest {
            request_id: 2,
            gate_id: "gate-new".to_string(),
            action: "approve".to_string(),
        });

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id: 1,
                gate_id: "gate-old".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitting)
        );
        assert_eq!(
            app.transient
                .active_submit
                .as_ref()
                .map(|request| request.request_id),
            Some(2)
        );
    }

    #[test]
    fn mismatched_submit_result_does_not_clear_pending_followup() {
        let mut app = app_with_pending(1);
        app.transient.optimistic_action = Some(OptimisticAction {
            gate_id: "gate-active".to_string(),
            task_id: Some("T-active".to_string()),
            action: "approve".to_string(),
            phase: OptimisticPhase::Submitting,
            deadline_at: Duration::from_secs(5),
        });
        app.transient.active_submit = Some(SubmitRequest {
            request_id: 1,
            gate_id: "gate-active".to_string(),
            action: "approve".to_string(),
        });
        app.transient.pending_submit = Some(SubmitRequest {
            request_id: 2,
            gate_id: "gate-followup".to_string(),
            action: "reject".to_string(),
        });

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id: 1,
                gate_id: "gate-active".to_string(),
                action: "reject".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );

        assert_eq!(
            app.transient
                .pending_submit
                .as_ref()
                .map(|request| request.request_id),
            Some(2)
        );
        assert!(app.transient.active_submit.is_none());
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitting)
        );
    }

    #[test]
    fn submit_failure_marks_failed_without_blocking_loop() {
        let mut app = app_with_pending(1);

        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(10)),
        );
        update(&mut app, AppEvent::MoveSelection(1));
        let request_id = dispatch_pending_submit_for_test(&mut app);

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Failed("approve failed for gate-0".to_string()),
            }),
        );

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Failed)
        );
        assert_eq!(app.transient.last_action, "approve failed for gate-0");
    }

    #[test]
    fn control_success_with_rebuild_failure_is_partial_success() {
        let mut app = app_with_pending(1);

        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(10)),
        );
        let request_id = dispatch_pending_submit_for_test(&mut app);

        let rebuild_failure = "approve gate-0 applied, but follow-up rebuild failed: whitebox-summary.js rebuild failed: summary artifact stale. Control state already changed; refresh artifacts before retrying.";
        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::PartialSuccess(rebuild_failure.to_string()),
            }),
        );

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::PartialSuccess)
        );
        assert_eq!(app.transient.last_action, rebuild_failure);

        update(
            &mut app,
            AppEvent::Tick(ACTION_CONFIRM_TIMEOUT + Duration::from_millis(1)),
        );

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::PartialSuccess)
        );
    }

    #[test]
    fn quit_event_is_processed_while_control_command_is_in_flight() {
        let mut app = app_with_pending(1);
        let submit_controller = SubmitController::new();

        update(&mut app, AppEvent::EnterDetail);
        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(10)),
        );
        assert!(submit_active(&app));
        let request_id = dispatch_pending_submit_for_test(&mut app);

        update(&mut app, AppEvent::BackToBoard);

        assert_eq!(app.view.mode, ViewMode::Board);
        assert!(submit_active(&app));
        assert!(!request_quit(&mut app, &submit_controller));
        assert!(app.transient.quit_requested);

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );

        let drained_controller = SubmitController::new();
        assert!(quit_ready(&app, &drained_controller));
    }

    #[test]
    fn second_quit_forces_exit_while_submit_is_stuck() {
        let mut app = app_with_pending(1);
        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(10)),
        );
        let request = activate_pending_submit_for_test(&mut app);
        let (submit_controller, _sender) =
            submit_controller_with_active_request(request, Duration::from_millis(10));

        assert!(!request_quit(&mut app, &submit_controller));
        assert!(app.transient.quit_requested);
        assert_eq!(
            app.transient.last_action,
            "quit requested; waiting for control submit to finish (press q again to force quit)"
        );

        assert!(request_quit(&mut app, &submit_controller));
        assert_eq!(
            app.transient.last_action,
            "force quit requested; leaving while control submit is still running"
        );
    }

    #[test]
    fn timed_out_submit_releases_running_state() {
        let mut app = app_with_pending(1);
        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(0)),
        );
        let request = activate_pending_submit_for_test(&mut app);
        let request_id = request.request_id;
        let (mut submit_controller, _sender) =
            submit_controller_with_active_request(request, Duration::from_millis(0));

        let result = submit_controller
            .take_result(SUBMIT_WORK_TIMEOUT + Duration::from_millis(1))
            .expect("timed out result");

        assert!(!submit_controller.running());
        assert_eq!(result.request_id, request_id);
        assert!(matches!(
            result.outcome,
            SubmitOutcome::Failed(ref message) if message == "approve timed out for gate-0"
        ));

        update(&mut app, AppEvent::SubmitFinished(result));

        assert!(app.transient.active_submit.is_none());
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Failed)
        );
        assert_eq!(app.transient.last_action, "approve timed out for gate-0");
    }

    #[test]
    fn stale_submit_result_after_timeout_retry_is_ignored() {
        let mut app = app_with_pending(1);
        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(0)),
        );
        let first_request = activate_pending_submit_for_test(&mut app);
        let first_request_id = first_request.request_id;
        let (mut submit_controller, _sender) =
            submit_controller_with_active_request(first_request, Duration::from_millis(0));

        let timeout_result = submit_controller
            .take_result(SUBMIT_WORK_TIMEOUT + Duration::from_millis(1))
            .expect("timed out result");
        update(&mut app, AppEvent::SubmitFinished(timeout_result));

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Failed)
        );

        update(&mut app, AppEvent::ApproveSelected(Duration::from_secs(6)));
        let retry_request = activate_pending_submit_for_test(&mut app);

        assert!(retry_request.request_id > first_request_id);
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitting)
        );

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id: first_request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );

        assert_eq!(
            app.transient
                .active_submit
                .as_ref()
                .map(|request| request.request_id),
            Some(retry_request.request_id)
        );
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitting)
        );

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id: retry_request.request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Submitted)
        );
    }

    #[test]
    fn narrow_board_footer_exposes_submit_keys() {
        let app = app_with_pending(1);

        let snapshot = snapshot_with_size(app, 100, 40).expect("narrow snapshot renders");

        assert!(snapshot.contains("a approve  r reject  q quit"));
    }

    #[test]
    fn late_reload_after_timeout_does_not_corrupt_state() {
        let mut app = app_with_pending(1);
        update(
            &mut app,
            AppEvent::ApproveSelected(Duration::from_millis(0)),
        );
        let request_id = dispatch_pending_submit_for_test(&mut app);

        update(
            &mut app,
            AppEvent::Tick(ACTION_CONFIRM_TIMEOUT + Duration::from_millis(1)),
        );
        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Failed)
        );

        update(
            &mut app,
            AppEvent::SubmitFinished(SubmitResult {
                request_id,
                gate_id: "gate-0".to_string(),
                action: "approve".to_string(),
                outcome: SubmitOutcome::Submitted,
            }),
        );

        assert_eq!(
            app.transient
                .optimistic_action
                .as_ref()
                .map(|state| state.phase),
            Some(OptimisticPhase::Failed)
        );
    }
}
