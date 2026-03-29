---
name: discuss
description: "Gray area 식별 및 사용자 결정 수집. CONTEXT.md를 생성하여 downstream 에이전트가 재질문 없이 작업 가능. GSD discuss-phase 패턴 기반."
triggers:
  - /discuss
  - 토론하자
  - 결정 수집
  - context 생성
version: 1.0.0
updated: 2026-03-29
---

# /discuss — 구현 결정 수집

> **목표**: 사용자의 구현 결정을 수집하여 CONTEXT.md 생성
>
> **철학**: 사용자 = 비전가, Claude = 빌더. 비전과 선택을 물어보고, 기술적 구현은 Claude가 결정.

## 출력 경로

- 프로젝트 레벨: `.claude/CONTEXT.md`
- 작업별: `.claude/context/{task-id}.md`

## 절대 금지

1. 기술적 구현 세부사항 질문 (아키텍처, 라이브러리 선택 등)
2. 범위 확장 제안 (새 기능 추가 유도)
3. 모든 영역 질문 - 관련 있는 것만 물어봄

## 실행 순서

### Step 1: 작업 범위 확인

```bash
# TASKS.md에서 현재 작업 확인
CURRENT_TASK=$(grep -E '^\s*-\s*\[ \]' TASKS.md | head -1)
```

### Step 2: Gray Area 식별

작업 유형에 따라 관련 gray area 식별:
- **UI 작업**: 레이아웃, 인터랙션, 상태 표시
- **API 작업**: 응답 포맷, 에러 처리, 인증
- **CLI 작업**: 플래그 디자인, 출력 포맷, 에러 복구
- **데이터 작업**: 그룹핑 기준, 중복 처리, 명명 규칙

### Step 3: AskUserQuestion으로 결정 수집

각 gray area에 대해 AskUserQuestion 호출:

```json
{
  "question": "{gray area에 대한 구체적 질문}",
  "options": [
    { "label": "옵션 A", "description": "..." },
    { "label": "옵션 B", "description": "..." },
    { "label": "Claude 재량", "description": "알아서 결정해도 됨" }
  ]
}
```

### Step 4: CONTEXT.md 생성

수집된 결정을 바탕으로 `.claude/CONTEXT.md` 또는 `.claude/context/{task-id}.md` 생성.

### Step 5: 결과 확인

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 /discuss COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 결정 수집 완료:
 - D-01: {결정 1}
 - D-02: {결정 2}
 - Claude 재량: {재량 영역}

 CONTEXT.md 생성됨: .claude/CONTEXT.md

 다음 단계: /agile 또는 작업 시작
```

## Gray Area 예시

### UI 작업
- 레이아웃: 카드 vs 리스트 vs 테이블
- 로딩: 스켈레톤 vs 스피너 vs 프로그레스바
- 빈 상태: 일러스트 + 메시지 vs 간단한 텍스트

### API 작업
- 에러 응답: 상세 vs 간단
- 페이지네이션: 커서 vs 오프셋
- 인증: Bearer vs API key

### CLI 작업
- 출력: JSON vs 테이블 vs 플레인텍스트
- 플래그: 짧은(-v) vs 긴(--verbose) vs 둘 다
- 에러: 재시도 vs 즉시 실패

---

**Last Updated**: 2026-03-29 (v1.0.0)
