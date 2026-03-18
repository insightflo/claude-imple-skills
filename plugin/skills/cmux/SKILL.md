---
name: cmux
description: cmux 터미널 멀티플렉서 제어 스킬. 워크스페이스/패널/서피스 관리, 명령 전송, 브라우저 자동화, 알림, 사이드바 메타데이터 제어. '/cmux', 'cmux', '워크스페이스 만들어', '패널 분할', '브라우저 열어', '알림 보내' 등 cmux 터미널 제어 요청이라면 반드시 이 스킬을 사용하세요.
triggers:
  - /cmux
  - cmux
  - 워크스페이스
  - 패널 분할
  - 브라우저 열어
  - 알림 보내
version: 1.0.0
---

# /cmux — cmux Terminal Multiplexer Control

cmux는 Ghostty 기반 macOS 네이티브 터미널로, 여러 AI 코딩 에이전트를 관리하기 위해 설계되었다.
CLI(`cmux`) 또는 Unix 소켓(`/tmp/cmux.sock`)으로 프로그래밍 제어 가능.

---

## 1. 계층 구조 (4-Level Hierarchy)

```
Window → Workspace → Pane → Surface → Panel(Terminal|Browser)
```

| Level | 설명 | 생성 | 식별 |
|-------|------|------|------|
| Window | macOS 윈도우 | `⌘⇧N` | — |
| Workspace | 사이드바 항목 (탭) | `⌘N` / `cmux new-workspace` | `CMUX_WORKSPACE_ID` |
| Pane | 분할 영역 | `⌘D`(우) / `⌘⇧D`(하) / `cmux new-split` | Panel ID |
| Surface | 패인 내 탭 | `⌘T` | `CMUX_SURFACE_ID` |
| Panel | 터미널 또는 브라우저 | 자동 | Panel ID (내부) |

```
┌─────────────────────────────────────────────┐
│ ┌──────────┐ ┌────────────────────────────┐ │
│ │ Sidebar  │ │ Workspace "dev"            │ │
│ │          │ │ ┌──────────┬─────────────┐ │ │
│ │ > dev    │ │ │ Pane 1   │ Pane 2      │ │ │
│ │   server │ │ │ [S1][S2] │ [S1]        │ │ │
│ │   logs   │ │ │ Terminal │ Terminal    │ │ │
│ │          │ │ └──────────┴─────────────┘ │ │
│ └──────────┘ └────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 2. cmux 감지 (Detection)

```bash
# 소켓 확인
SOCK="${CMUX_SOCKET_PATH:-/tmp/cmux.sock}"
[ -S "$SOCK" ] && echo "cmux socket available"

# CLI 확인
command -v cmux &>/dev/null && echo "cmux CLI available"

# cmux 내부인지 확인
[ -n "${CMUX_WORKSPACE_ID:-}" ] && echo "Inside cmux"
```

---

## Fallback

| 상황 | 동작 |
|------|------|
| cmux CLI 없음 | 일반 터미널로 fallback, 패널 분할 불가 |
| cmux 소켓 타임아웃 | CLI 모드로 fallback, `--timeout-ms` 지정 |
| cmux 외부 실행 | `CMUX_WORKSPACE_ID` 없으면 워크스페이스 ID 명시 필요 |

---

## 3. CLI 전역 옵션

| Flag | 용도 |
|------|------|
| `--socket PATH` | 커스텀 소켓 경로 |
| `--json` | JSON 출력 |
| `--window ID` | 특정 윈도우 대상 |
| `--workspace ID` | 특정 워크스페이스 대상 |
| `--surface ID` | 특정 서피스 대상 |
| `--id-format refs\|uuids\|both` | ID 포맷 제어 |

---

## 4. Workspace 명령

```bash
# 목록 조회
cmux list-workspaces [--json]

# 새 워크스페이스
cmux new-workspace

# 현재 워크스페이스
cmux current-workspace [--json]

# 선택 (전환)
cmux select-workspace --workspace <id>

# 닫기
cmux close-workspace --workspace <id>
```

### Socket API

```json
{"id":"1","method":"workspace.list","params":{}}
{"id":"2","method":"workspace.create","params":{}}
{"id":"3","method":"workspace.current","params":{}}
{"id":"4","method":"workspace.select","params":{"workspace_id":"<id>"}}
{"id":"5","method":"workspace.close","params":{"workspace_id":"<id>"}}
```

---

## 5. Split & Surface 명령

```bash
# 분할 생성 (방향: left, right, up, down)
cmux new-split right
cmux new-split down

# 서피스 목록
cmux list-surfaces [--json]

# 서피스 포커스
cmux focus-surface --surface <id>
```

---

## 6. Input 명령 (텍스트/키 전송)

```bash
# 포커스된 터미널에 텍스트 전송
cmux send "echo hello"
cmux send "ls -la\n"           # \n = Enter

# 키 전송 (enter, tab, escape, backspace, delete, up, down, left, right)
cmux send-key enter

# 특정 서피스에 전송
cmux send --surface <id> "command"
cmux send-key --surface <id> enter
```

### Socket API

```json
{"id":"1","method":"surface.send_text","params":{"text":"echo hello\n"}}
{"id":"2","method":"surface.send_key","params":{"key":"enter"}}
{"id":"3","method":"surface.send_text","params":{"surface_id":"<id>","text":"command\n"}}
```

---

## 7. Notification 명령

```bash
# 알림 전송
cmux notify --title "Title" --body "Body"
cmux notify --title "T" --subtitle "S" --body "B"

# 목록
cmux list-notifications [--json]

# 전체 삭제
cmux clear-notifications
```

### OSC 777 (간단한 터미널 알림)

```bash
printf '\e]777;notify;Title;Body\a'
```

---

## 8. Sidebar Metadata 명령

사이드바에 상태 배지, 진행률, 로그를 표시한다.

```bash
# 상태 설정/제거/목록
cmux set-status <key> "<value>" [--icon <name>] [--color "<hex>"]
cmux set-status build "compiling" --icon hammer --color "#ff9500"
cmux clear-status <key>
cmux list-status

# 진행률 (0.0 ~ 1.0)
cmux set-progress 0.5 --label "Building..."
cmux set-progress 1.0 --label "Done"
cmux clear-progress

# 로그 (level: info, progress, success, warning, error)
cmux log "Build started"
cmux log --level error --source build "Compilation failed"
cmux log --level success -- "All 42 tests passed"
cmux clear-log
cmux list-log [--limit N]

# 사이드바 전체 상태 덤프
cmux sidebar-state [--workspace <id>]
```

---

## 9. Browser Automation 명령

전체 레퍼런스는 `references/browser-automation.md` 참조. 핵심 명령만 아래에 요약:

```bash
# 열기 / 닫기
cmux browser open <url>
cmux browser open-split <url>
cmux browser <surface> navigate <url> [--snapshot-after]

# 대기
cmux browser <surface> wait --load-state complete --timeout-ms 15000
cmux browser <surface> wait --selector "#el" --timeout-ms 10000

# DOM 조작
cmux browser <surface> click "selector" [--snapshot-after]
cmux browser <surface> fill "selector" --text "value"
cmux browser <surface> type "selector" "text"

# 검사
cmux browser <surface> snapshot --interactive --compact
cmux browser <surface> screenshot --out /tmp/page.png
cmux browser <surface> get text "selector"
cmux browser <surface> eval "document.title"
```

---

## 10. Utility 명령

```bash
cmux ping                      # 연결 확인
cmux capabilities [--json]     # 사용 가능한 메서드 목록
cmux identify [--json]         # 현재 포커스 컨텍스트
```

---

## 11. 환경 변수

| 변수 | 용도 |
|------|------|
| `CMUX_SOCKET_PATH` | 소켓 경로 오버라이드 |
| `CMUX_SOCKET_ENABLE` | 소켓 활성화/비활성화 (1/0) |
| `CMUX_SOCKET_MODE` | 접근 모드 (cmuxOnly / allowAll / off) |
| `CMUX_WORKSPACE_ID` | 자동 설정: 현재 워크스페이스 ID |
| `CMUX_SURFACE_ID` | 자동 설정: 현재 서피스 ID |

---

## 12. Python Socket Client

```python
import json, os, socket

SOCKET_PATH = os.environ.get("CMUX_SOCKET_PATH", "/tmp/cmux.sock")

def rpc(method, params=None, req_id=1):
    payload = {"id": req_id, "method": method, "params": params or {}}
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.connect(SOCKET_PATH)
        sock.sendall(json.dumps(payload).encode("utf-8") + b"\n")
        return json.loads(sock.recv(65536).decode("utf-8"))
```

---

## 13. 키보드 단축키 요약

### Workspace
| 액션 | 단축키 |
|------|--------|
| 새 워크스페이스 | `⌘N` |
| 워크스페이스 1~8 이동 | `⌘1`~`⌘8` |
| 마지막 워크스페이스 | `⌘9` |
| 워크스페이스 닫기 | `⌘⇧W` |
| 이름 변경 | `⌘⇧R` |

### Surface
| 액션 | 단축키 |
|------|--------|
| 새 서피스 | `⌘T` |
| 이전/다음 서피스 | `⌘⇧[` / `⌘⇧]` |
| 서피스 1~8 이동 | `⌃1`~`⌃8` |
| 서피스 닫기 | `⌘W` |

### Split
| 액션 | 단축키 |
|------|--------|
| 우측 분할 | `⌘D` |
| 하단 분할 | `⌘⇧D` |
| 패널 이동 | `⌥⌘←/→/↑/↓` |
| 브라우저 우측 분할 | `⌥⌘D` |
| 브라우저 하단 분할 | `⌥⌘⇧D` |

### Browser
| 액션 | 단축키 |
|------|--------|
| 브라우저 서피스 열기 | `⌘⇧L` |
| 주소창 포커스 | `⌘L` |
| 개발자 도구 | `⌥⌘I` |

### Notifications
| 액션 | 단축키 |
|------|--------|
| 알림 패널 | `⌘⇧I` |
| 최근 미읽음 이동 | `⌘⇧U` |

---

## 14. 소켓 설정 (Access Mode)

| 모드 | 설명 |
|------|------|
| Off | 소켓 비활성화 |
| cmux processes only | cmux 내부 프로세스만 허용 (기본값) |
| allowAll | 모든 로컬 프로세스 허용 (`CMUX_SOCKET_MODE=allowAll`) |

소켓 경로: Release `/tmp/cmux.sock` / Debug `/tmp/cmux-debug.sock`

---

## 15. 자주 사용하는 패턴

### 멀티 에이전트 워크스페이스 세팅

```bash
# 3개 워크스페이스 생성 + 각각에 명령 전송
cmux new-workspace  # agent-1
cmux new-workspace  # agent-2
cmux new-workspace  # agent-3

# 특정 워크스페이스의 서피스에 명령 전송
cmux send --workspace <id> "claude code --resume
"
```

### 빌드 알림 패턴

```bash
npm run build && cmux notify --title "Build OK" --body "Ready" \
              || cmux notify --title "Build FAIL" --body "Check logs"
```

### 사이드바 진행률 표시

```bash
cmux set-progress 0.0 --label "Starting..."
# ... work ...
cmux set-progress 0.5 --label "Halfway"
# ... work ...
cmux set-progress 1.0 --label "Done"
cmux log --level success -- "Task complete"
```

### 브라우저 자동화 (로그인 → 스크래핑)

```bash
cmux browser open https://example.com/login
SURF=$(cmux browser identify --json | jq -r '.surface_id')
cmux browser $SURF wait --load-state complete --timeout-ms 10000
cmux browser $SURF fill "#email" --text "user@example.com"
cmux browser $SURF fill "#password" --text "$PASSWORD"
cmux browser $SURF click "button[type='submit']" --snapshot-after
cmux browser $SURF wait --text "Dashboard"
cmux browser $SURF screenshot --out /tmp/dashboard.png
```

---

## 아키텍처 요약

```
cmux (Ghostty 기반 macOS 네이티브)
├── Window ← 최상위 컨테이너
│   └── Workspace ← 탭 단위 (new-workspace)
│       └── Pane ← 분할 영역 (new-split right/down)
│           └── Surface ← 입출력 단위 (send --surface)
│
├── CLI: cmux <command> [options]
├── Socket: /tmp/cmux.sock (JSON-RPC)
└── 제어 영역: 입력전송 / 알림 / 상태바 / 사이드바 / 브라우저
```
