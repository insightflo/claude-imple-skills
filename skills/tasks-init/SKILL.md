---
name: tasks-init
description: TASKS.md 스캐폴딩을 대화형으로 생성합니다. 프로젝트 시작 시, TASKS.md가 없을 때, 태스크 구조화가 필요할 때 반드시 사용하세요. "태스크 만들어줘", "TASKS.md 생성", "프로젝트 시작", "할일 정리" 요청에 즉시 실행. Standalone 독립 실행. /tasks-init 트리거.
triggers:
  - /tasks-init
  - 태스크 초기화
  - TASKS 만들어줘
  - 태스크 생성
  - 프로젝트 시작
  - 할일 정리
version: 2.1.0
---

# Tasks Init (Standalone)

> TASKS.md 파일을 대화형으로 생성하는 경량 스킬입니다.
> Standalone으로 완전히 독립 실행 가능합니다.

## 역할

- 프로젝트 정보를 대화형으로 수집
- **Specialist 컨텍스트 주입**으로 상세 태스크 생성
- 자동 의존성 감지 및 메타데이터 추가
- Domain-guarded TASKS.md 생성 (백엔드/프론트엔드 분리)

**v2.0.0 업데이트**: Dependency-aware, Domain-guarded, Specialist 통합

## 실행 흐름

```
/tasks-init 실행
     ↓
┌─────────────────────────────────────────────────────────────┐
│ 1단계: 프로젝트 정보 수집 (AskUserQuestion)                  │
│   • 프로젝트 이름                                            │
│   • 주요 기능 (3-5개)                                        │
│   • 기술 스택 (자동 감지)                                     │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2단계: 기존 코드 분석 (자동)                                 │
│   • package.json / pyproject.toml 파싱                      │
│   • 디렉토리 구조 스캔 (도메인 감지)                           │
│   • import/require 의존성 분석                                 │
│   • 기존 TODO 마커 수집                                      │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3단계: **Specialist 컨텍스트 주입** (v2.0 NEW)            │
│   • Backend Specialist → 백엔드 태스크 상세화                │
│   • Frontend Specialist → 프론트엔드 태스크 상세화              │
│   • Security Specialist → 보안 관련 태스크 추가                  │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4단계: TASKS.md 생성 (Dependency-aware)                       │
│   • 자동 의존성 계산 (deps 필드)                              │
│   • 도메인 분리 (domain 필드)                                  │
│   • 위험도 자동 분류 (risk 필드)                               │
│   • 파일 충돌 감지 (files 필드)                               │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5단계: 사용자 확인 + 다음 단계 안내                          │
│   → owner 기반 자동 라우팅 확인 + /agile auto 또는            │
│     /orchestrate-standalone 실행 권장                        │
└─────────────────────────────────────────────────────────────┘
```

## 1단계: 프로젝트 정보 수집

```json
{
  "questions": [
    {
      "question": "프로젝트의 주요 기능을 알려주세요 (예: 사용자 인증, 상품 목록, 결제)",
      "header": "주요 기능",
      "options": [
        {"label": "직접 입력", "description": "기능 목록을 직접 작성"}
      ],
      "multiSelect": false
    }
  ]
}
```

## 2단계: 코드 분석

```bash
# 기술 스택 감지
ls package.json pyproject.toml requirements.txt Cargo.toml go.mod 2>/dev/null

# 디렉토리 구조
ls -d */ 2>/dev/null | head -10

# 기존 TODO 수집
grep -rn "TODO\|FIXME\|XXX" --include="*.ts" --include="*.tsx" --include="*.py" 2>/dev/null | head -20
```

## 3단계: TASKS.md 템플릿

```markdown
# TASKS.md

> 생성일: {date}
> 프로젝트: {project_name}

---

## T0 - Skeleton (구조)

- [ ] T0.1: 프로젝트 초기 설정
- [ ] T0.2: 디렉토리 구조 생성
- [ ] T0.3: 라우팅/네비게이션 설정
- [ ] T0.4: 더미 데이터 구조 정의

## T1 - Muscles (핵심 기능)

{기능별 태스크 자동 생성}

- [ ] T1.1: {기능1} 백엔드 구현
- [ ] T1.2: {기능1} 프론트엔드 구현
- [ ] T1.3: {기능2} 백엔드 구현
- [ ] T1.4: {기능2} 프론트엔드 구현

## T2 - Muscles Advanced (고급 기능)

- [ ] T2.1: 에러 핸들링
- [ ] T2.2: 로딩 상태 관리
- [ ] T2.3: 캐싱 레이어

## T3 - Skin (마무리)

- [ ] T3.1: 디자인 시스템 적용
- [ ] T3.2: 반응형 레이아웃
- [ ] T3.3: 애니메이션/전환 효과
- [ ] T3.4: 접근성 검토
```

## 4단계: 다음 단계 안내

```json
{
  "questions": [
    {
      "question": "TASKS.md가 생성되었습니다. 다음 단계를 선택하세요:",
      "header": "다음 단계",
      "options": [
        {"label": "구현 시작 (/agile auto)", "description": "30개 이하 태스크용 레이어별 자동 구현"},
        {"label": "병렬 오케스트레이션 (/orchestrate-standalone)", "description": "30~80개 태스크용 의존성 기반 병렬 실행"},
        {"label": "수동 진행", "description": "직접 태스크 수정 후 진행"}
      ],
      "multiSelect": false
    }
  ]
}
```

생성된 TASKS.md에서는 `owner`가 기본 실행기를 결정하고, `model`은 owner/model-routing 자동 라우팅을 덮어야 할 때만 넣습니다.

## 관련 스킬

| 스킬 | 관계 |
|------|------|
| `/tasks-migrate` | 기존 레거시 파일 통합 |
| `/agile auto` | 생성된 TASKS.md 실행 (≤30 태스크) |
| `/orchestrate-standalone` | 병렬 오케스트레이션 (30~80 태스크) |
| `/governance-setup` | 대규모 프로젝트 기획 |

---

**Last Updated**: 2026-03-03 (v2.0.0)

## 파일 구조

```
skills/tasks-init/
├── SKILL.md                    # 스킬 정의
├── scripts/
│   ├── analyze.js              # 코드 분석 (기술 스택, 의존성, TODO)
│   ├── generate.js             # 태스크 생성 (Specialist 컨텍스트 주입)
│   └── tasks-init.sh           # 메인 진입점
└── templates/
    ├── task-metadata.yaml      # 메타데이터 포맷 설명
    └── TASKS.md                # 생성될 TASKS.md 템플릿
```

## 사용법

### CLI 직접 실행

```bash
# 기본 사용 (현재 디렉토리에 TASKS.md 생성)
cd skills/tasks-init/scripts
./tasks-init.sh

# 출력 파일 지정
./tasks-init.sh --output ../TASKS.md

# 기능 목록 지정
./tasks-init.sh --features "user-auth,product-catalog,payment"
```

### 스킬로 실행

```bash
/tasks-init
```

Claude가 대화형으로 프로젝트 정보를 수집한 후 TASKS.md를 생성합니다.
