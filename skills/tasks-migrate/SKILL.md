---
name: tasks-migrate
description: 레거시 태스크 파일(docs/planning/06-tasks.md 등)을 root TASKS.md로 통합합니다. 기존 태스크 파일이 여러 곳에 분산되어 있을 때, "태스크 마이그레이션", "06-tasks를 TASKS로", "태스크 통합" 요청에 반드시 사용하세요.
triggers:
  - /tasks-migrate
  - 태스크 마이그레이션
  - 06-tasks를 TASKS로
  - 태스크 통합
  - migrate tasks
version: 1.0.0
---

# Tasks Migrate Skill

레거시 태스크 파일(docs/planning/06-tasks.md, task.md 등)을 스캔하여 root `TASKS.md`로 통합합니다.

## 역할

- 여러 위치에 흩어진 태스크 파일을 탐지
- 체크박스 항목과 Task ID를 추출
- root `TASKS.md`로 병합 (중복 제거)
- 레거시 파일은 수정하지 않음 (안전)

## 워크플로우

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 탐지 Phase                                               │
├─────────────────────────────────────────────────────────────┤
│  • TASKS.md 존재 여부 확인                                  │
│  • 레거시 파일 스캔 (우선순위순)                            │
│  • 발견된 체크박스 항목 집계                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 분석 Phase                                               │
├─────────────────────────────────────────────────────────────┤
│  • Task ID 추출 (P*-T*, T*.*)                               │
│  • 레이어 분류 (T0-T3, P*)                                  │
│  • 중복 감지                                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 사용자 확인                                              │
├─────────────────────────────────────────────────────────────┤
│  • Migration summary 출력                                   │
│  • 생성/병합/취소 선택                                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 출력 Phase                                               │
├─────────────────────────────────────────────────────────────┤
│  • TASKS.md 생성 또는 병합                                  │
│  • Migration report 섹션 추가                               │
└─────────────────────────────────────────────────────────────┘
```

## 실행 단계

### Phase 1: 탐지

다음 순서로 태스크 파일 존재 여부를 확인합니다:

```bash
# 우선순위 순서
ls -la TASKS.md 2>/dev/null
ls -la docs/planning/06-tasks.md 2>/dev/null
ls -la docs/planning/tasks.md 2>/dev/null
ls -la docs/tasks.md 2>/dev/null
ls -la planning/tasks.md 2>/dev/null
ls -la .tasks.md 2>/dev/null
ls -la task.md 2>/dev/null
```

**Fallback**: 위 파일이 없으면 `*tasks*.md` 패턴으로 검색

### Phase 2: 분석

발견된 파일에서 체크박스 항목을 추출합니다:

**추출 대상:**
```markdown
- [ ] 미완료 태스크
- [x] 완료된 태스크
- [/] 진행 중 (optional: - [ ] (in progress)로 normalize)
```

**Task ID 패턴:**
```
P\d+(?:-[A-Z]\d+)?(?:-T\d+)?   # P1-T1, P2-S1-T3
T\d+(?:\.\d+)+                  # T0.1, T1.12, T3.4
```

**분류 기준:**
| ID Pattern | Layer | Section |
|------------|-------|---------|
| `T0.*` | Skeleton | `## T0 — Skeleton` |
| `T1.*` | Muscles | `## T1 — Muscles` |
| `T2.*` | Muscles Advanced | `## T2 — Muscles (advanced)` |
| `T3.*` | Skin | `## T3 — Skin` |
| `P*-*` | Phase-based | `## P* — Project/Phase tasks` |
| (no ID) | Uncategorized | `## Uncategorized` |

### Phase 3: 사용자 확인

Migration summary를 출력하고 사용자에게 확인을 요청합니다:

```markdown
## Migration Summary

### 발견된 파일
| File | Tasks | Checked | Unchecked |
|------|-------|---------|-----------|
| docs/planning/06-tasks.md | 25 | 20 | 5 |
| task.md | 3 | 1 | 2 |

### ID 분포
- T0.* (Skeleton): 5개
- T1.* (Muscles): 12개
- T2.* (Advanced): 3개
- T3.* (Skin): 5개
- P*-T* (Phase): 3개
- 무ID: 0개

### 예상 결과
- TASKS.md 생성/병합: 28개 항목
- 중복 제거: 2개
```

**AskUserQuestion으로 확인:**
- 생성 (TASKS.md 새로 생성)
- 병합 (기존 TASKS.md에 추가)
- 취소 (아무것도 하지 않음)

### Phase 4: 출력

**TASKS.md 구조:**
```markdown
# TASKS.md

> Canonical task file for this project.
> Migrated: {date}

## T0 — Skeleton

- [ ] T0.1: 프로젝트 구조 설정
- [x] T0.2: 라우팅 설정

## T1 — Muscles

- [ ] T1.1: 인증 기능 구현
- [ ] T1.2: API 연동

## T2 — Muscles (advanced)

- [ ] T2.1: 캐싱 레이어
- [ ] T2.2: 에러 핸들링

## T3 — Skin

- [ ] T3.1: 애니메이션 적용
- [ ] T3.2: 반응형 디자인

## P* — Project/Phase tasks

- [x] P1-T1: 설계 문서 완료
- [ ] P2-T1: Hook 구현

---

## Migration Report

| Source | Imported | Duplicates Skipped |
|--------|----------|-------------------|
| docs/planning/06-tasks.md | 25 | 2 |
| task.md | 3 | 0 |

**Total**: 28 tasks imported
**Date**: 2026-03-03
```

## 안전장치

1. **레거시 파일 미수정**: 원본 파일을 절대 삭제하거나 수정하지 않음
2. **중복 제거**: 동일 ID가 있으면 기존 항목 유지
3. **사용자 확인 필수**: 생성/병합 전 반드시 AskUserQuestion으로 확인
4. **Dry-run 지원**: `--dry-run` 옵션으로 미리보기만 가능

## 사용 예시

```
/tasks-migrate

# 또는
"06-tasks.md를 TASKS.md로 마이그레이션해줘"
"레거시 태스크 파일 통합"
```

## 관련 스킬

- `/workflow-guide` — 마이그레이션 필요 여부 진단
- `/agile` — 마이그레이션 후 스프린트 실행
- `/recover` — 태스크 파일 복구 시 참조
