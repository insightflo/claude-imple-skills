# Configuration Guide

Configuration file for setting up council members and their roles.

## Schema

```yaml
council:
  members:
    - name: claude
      command: "claude -p"
      emoji: "🧠"
      color: "CYAN"
      role: "spec-compliance"  # 명세 준수 중심
      focus: ["Solid 원칙", "패턴 분석", "정확성", "최적화 가능성"]

    - name: codex
      command: "codex exec"
      emoji: "🤖"
      color: "BLUE"
      role: "technical-depth"  # 기술적 깊이 검토
      focus: ["아키텍처", "설계", "타당성", "기술적 부채"]

    - name: gemini
      command: "gemini"
      emoji: "💎"
      color: "GREEN"
      role: "creative"  # 창의적 대안 제안
      focus: ["사용자 경험", "UX", "접근성", "대안 아이디어"]

  # Chairman configuration
  chairman:
    # role: auto|claude|codex|gemini|...
    # - auto: Host agent acts as chairman (Claude Code => claude, Codex CLI => gemini CLI)
    role: "auto"
    description: "Synthesizes all opinions and provides final recommendation"
    # Optional: run synthesis inside council.sh via CLI (requires chairman.command)
    # command: "codex exec"  # Force Stage 3 with --chairman flag
    # command: "claude -p"  # Claude as chairman (inside council.sh)
    # command: "gemini"
  # Force stage 3 synthesis
    synthesize: false
    # Optional: if set to true, forces chairman to run just as a member
    # - name: gemini
    #   command: "gemini"
    #   emoji: "💎"
    #   color: "GREEN"
    # - name: codex
    #   command: "codex exec"
    #   emoji: "🤖"
    #   color: "BLUE"

  # Execution settings
  settings:
    timeout: 120            # Timeout seconds per agent (0 to disable)
    exclude_chairman_from_members: true  # host agent is excluded from members list by default
```

## CLI 설치 참고

- Google Gemini CLI: https://github.com/google-gemini/gemini-cli
- OpenAI Codex CLI: https://github.com/openai/codex
- GLM (Z.AI): 미지원
- 기본 chairman: `claude` (기술적 깊이 담당)

- 병렬로 멤버들의 의견을 수집합니다.
- 결과는 `council` 폴더에 `.opinion.md` 파일에 저장합니다
- `job.json`에 진행률 추적용
- 호스트 CLI가 멤버들에게 완료 신호를 보냄 (예: "council 소집해줘", "council 소집 요청" 등)

- 멤버 중 name이 `done`인 항목이 있으면 종료 신호로 처리하며, 설정 오류 시 기본값 사용
- **council.config.yaml**의 `role: auto` 사용 시 다양한 역할을 혼용할 수 있습니다
    - `spec_compliance`: 명세 준수 중심 검토
    - `architecture`: 구조 분석
    - `planning`: 계획 검토
    - `UX`: 사용자 경험 중심 평가
    - `security`: 보안 취약점, 공격 벡터 방지
    - `accessibility`: 접근성, i18n 지원
    - `i18n`: 국제화 지원
    - `creative`: 창의적 대안 제안
    - `integration`: Claude 최종 통합
- 출력 필드: `consensus_rate` (합의율 %), `consensus_reached` (합의 여부)

```

  # Host agent configuration
  host:
    role: auto
    description: "Host agent synthesizes results"
    # Optional: custom command for synthesis
    # command: "claude -p"
  # settings:
    timeout: 120
    exclude_chairman_from_members: true
```
