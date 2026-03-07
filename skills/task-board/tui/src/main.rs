use std::collections::HashMap;
use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crossterm::event::{self, Event, KeyCode};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::{CrosstermBackend, TestBackend};
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::prelude::{Alignment, Color, Line, Modifier, Span, Style};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Terminal;
use serde::Deserialize;

const COLUMN_ORDER: [&str; 4] = ["Backlog", "In Progress", "Blocked", "Done"];

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

#[derive(Debug, Clone, Deserialize, Default)]
struct WhiteboxSummary {
    #[serde(default)]
    gate_status: String,
    #[serde(default)]
    blocked_count: usize,
    #[serde(default)]
    stale_artifact_count: usize,
    #[serde(default)]
    run_id_short: Option<String>,
    #[serde(default)]
    tasks: TasksSummary,
    #[serde(default)]
    next_remediation_target: Option<NextRemediationTarget>,
}

#[derive(Debug, Clone)]
struct App {
    board: BoardState,
    summary: WhiteboxSummary,
    project_dir: PathBuf,
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

    for arg in std::env::args().skip(1) {
        if let Some(value) = arg.strip_prefix("--project-dir=") {
            project_dir = PathBuf::from(value);
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

fn load_app(project_dir: PathBuf) -> App {
    let board =
        read_json_or_default::<BoardState>(&project_dir.join(".claude/collab/board-state.json"));
    let summary = read_json_or_default::<WhiteboxSummary>(
        &project_dir.join(".claude/collab/whitebox-summary.json"),
    );

    App {
        board,
        summary,
        project_dir,
    }
}

fn column_cards<'a>(app: &'a App, name: &str) -> &'a [Card] {
    app.board
        .columns
        .get(name)
        .map(|cards| cards.as_slice())
        .unwrap_or(&[])
}

fn status_color(status: &str) -> Color {
    match status {
        "blocked" => Color::LightRed,
        "stale" => Color::Yellow,
        "running" => Color::LightBlue,
        "clear" => Color::LightGreen,
        _ => Color::Gray,
    }
}

fn render_header(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let run = app
        .summary
        .run_id_short
        .clone()
        .unwrap_or_else(|| "none".to_string());
    let phase = app
        .summary
        .tasks
        .current_phase
        .clone()
        .unwrap_or_else(|| "No active phase".to_string());
    let next_task = app
        .summary
        .tasks
        .next_task
        .clone()
        .unwrap_or_else(|| "none".to_string());
    let next = app
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
                format!("gate={}", app.summary.gate_status),
                Style::default()
                    .fg(status_color(&app.summary.gate_status))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::raw(format!("blocked={}", app.summary.blocked_count)),
            Span::raw("  "),
            Span::raw(format!("stale={}", app.summary.stale_artifact_count)),
            Span::raw("  "),
            Span::raw(format!("run={run}")),
        ]),
        Line::from(format!(
            "tasks {}/{}  |  phase {}  |  queue {}  |  next {}",
            app.summary.tasks.done, app.summary.tasks.total, phase, next_task, next
        )),
    ];

    let widget = Paragraph::new(lines)
        .block(Block::default().title("Status").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(widget, area);
}

fn render_column(app: &App, area: Rect, frame: &mut ratatui::Frame, column: &str) {
    let items: Vec<ListItem> = column_cards(app, column)
        .iter()
        .map(|card| {
            let mut lines = vec![Line::from(Span::styled(
                format!(
                    "{}{}",
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
            }

            if column == "Blocked" {
                if let Some(reason) = &card.blocker_reason {
                    lines.push(Line::from(Span::styled(
                        reason.clone(),
                        Style::default().fg(Color::LightRed),
                    )));
                }
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

fn render_footer(app: &App, area: Rect, frame: &mut ratatui::Frame) {
    let remediation = app
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
        .unwrap_or_else(|| {
            "Press q to quit. Non-TTY runs fall back to the legacy ASCII board.".to_string()
        });

    let text = vec![
        Line::from(format!("project {}", app.project_dir.display())),
        Line::from(remediation),
        Line::from(Span::styled("q quit", Style::default().fg(Color::DarkGray))),
    ];

    let footer = Paragraph::new(text)
        .alignment(Alignment::Left)
        .block(Block::default().title("Explain").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    frame.render_widget(footer, area);
}

fn ui(frame: &mut ratatui::Frame, app: &App) {
    let areas = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(12),
            Constraint::Length(5),
        ])
        .split(frame.size());

    render_header(app, areas[0], frame);

    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(25),
            Constraint::Percentage(25),
            Constraint::Percentage(25),
            Constraint::Percentage(25),
        ])
        .split(areas[1]);

    for (idx, column) in COLUMN_ORDER.iter().enumerate() {
        render_column(app, columns[idx], frame, column);
    }

    render_footer(app, areas[2], frame);
}

fn run(app: App) -> Result<(), Box<dyn Error>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    loop {
        terminal.draw(|frame| ui(frame, &app))?;
        if event::poll(Duration::from_millis(200))? {
            if let Event::Key(key) = event::read()? {
                if matches!(key.code, KeyCode::Char('q') | KeyCode::Esc) {
                    break;
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

fn snapshot(app: App) -> Result<String, Box<dyn Error>> {
    let backend = TestBackend::new(160, 36);
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
