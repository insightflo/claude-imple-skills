---
name: context-optimize
description: 긴 컨텍스트 최적화 - H2O 패턴으로 핵심 정보 추출, 압축, 요약. 컨텍스트 과부하 시 사용.
trigger: /compress, /optimize, "컨텍스트 압축", "문서 압축", "긴 문서 요약", "context overflow"
version: 1.0.0
updated: 2026-03-03
---

# Context Optimize Skill

> **언제 사용하나요?**
> - 긴 문서/코드를 분석해야 할 때
> - 컨텍스트 윈도우가 부족할 때
> - 여러 파일을 종합해야 할 때
> - 프로젝트 구현 시작 전 문서 정리 시

## Quick Start

```bash
# 핵심 정보 추출 (Heavy-Hitter)
/compress optimize <file>

# 문서 압축
/compress <file>

# LLM 기반 요약 (Claude CLI 필요)
/compress <file> --llm
```

---

## 사용 시나리오

### 1. 프로젝트 시작 전 문서 정리

```
상황: 기획서, 명세서가 너무 길어서 한 번에 읽기 어려움
해결: /compress optimize docs/spec.md --heavy-count=20
결과: 핵심 20개 항목만 추출하여 빠르게 파악
```

### 2. 컨텍스트 과부하

```
상황: "Context window exceeded" 또는 응답 품질 저하
해결: /compress <large-file> --summary-ratio=0.3
결과: 70% 압축하여 컨텍스트 여유 확보
```

### 3. 여러 파일 종합

```
상황: 10개 이상의 파일을 참조해야 함
해결: /compress build "요약해줘" docs/*.md
결과: RAG 하이브리드로 관련 내용만 추출
```

---

## 명령어

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `optimize <file>` | Heavy-Hitter 추출 | `/compress optimize spec.md` |
| `compress <file>` | 압축 (시작/끝 보존) | `/compress README.md` |
| `build <query> <files>` | RAG 하이브리드 | `/compress build "API 목록" src/*.ts` |

## 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--heavy-count=N` | 추출할 핵심 항목 수 | 10 |
| `--summary-ratio=N` | 압축 비율 (0.1~0.9) | 0.3 |
| `--llm` | LLM 기반 요약 사용 | false |
| `--json` | JSON 형식 출력 | false |

---

## 기술 원리

### H2O (Heavy-Hitter Oracle)

"Lost in the Middle" 현상 완화를 위해 핵심 정보를 상단에 배치:

| 타입 | 우선순위 | 예시 |
|------|---------|------|
| h1 헤더 | 1 | `# Title` |
| 클래스 정의 | 1 | `class Foo` |
| h2 헤더 | 2 | `## Section` |
| 함수 정의 | 2 | `function bar()` |
| 테이블 헤더 | 2 | `\| col1 \| col2 \|` |
| 코드 블록 | 3 | ` ```javascript` |
| 리스트 | 4 | `- item` |

**보너스 시스템**:
- 문서 상위 10%: 우선순위 0.8x (높음)
- 문서 하위 10%: 우선순위 0.9x
- 중요 키워드 (`CRITICAL`, `IMPORTANT`, `🔥`): 0.5x

### Compressive Context

오래된/덜 중요한 내용은 요약, 최신/핵심은 원본 유지:

```
[시작 5줄 - 원본 유지]
... (compressed) ...
[중간 샘플링]
... (compressed) ...
[끝 5줄 - 원본 유지]
```

### LLM 모드 (`--llm`)

Claude CLI를 활용한 의미 기반 요약:
- 구독 비용만으로 추가 API 비용 없음
- Claude Code 내부에서는 자동 fallback to heuristic

---

## 실행 방법

이 skill은 내부적으로 `contextOptimizer.js`를 호출합니다:

```bash
node project-team/services/contextOptimizer.js <command> <file> [options]
```

### 예시

```bash
# Heavy-Hitter 추출
node project-team/services/contextOptimizer.js optimize docs/spec.md --heavy-count=15 --json

# 압축
node project-team/services/contextOptimizer.js compress large-file.md --summary-ratio=0.2

# LLM 기반 (독립 터미널에서)
node project-team/services/contextOptimizer.js compress large-file.md --llm

# RAG 하이브리드
node project-team/services/contextOptimizer.js build "API 엔드포인트" src/*.ts
```

---

## 관련 리소스

- 상세 문서: `docs/plan/long-context-optimization.md`
- 서비스 README: `project-team/services/README.md`
- MCP 서버: `project-team/services/mcp-context-server.js`
