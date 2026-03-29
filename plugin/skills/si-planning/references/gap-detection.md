# SI Planning — Gap Detection 규칙

> **목적**: 요구사항(RD), 기능정의(FN), 화면정의(SC), 테스트케이스(TC) 간
> 추적성(Traceability) 단절 및 도메인 필수 항목 누락을 자동으로 탐지한다.
>
> **실행 시점**: Phase 2 Step 4, `--gap` 플래그 단독 실행, `--add` / `--change` 후

---

## 1. RTM Gap Detection (Requirements Traceability Matrix)

### 1-1. RD → FN 매핑 검증

```
[규칙 ID] GAP-RTM-01
[설명] 모든 기능 요구사항(RD-FR-*)은 최소 1개의 기능정의(FN-*)로 구현되어야 한다.
[입력] requirements-analysis.md의 RD-FR 목록, functional-spec.md의 FN 목록
[검증 로직]

  FOR EACH RD-FR-NNN in FR_list:
    IF FN이 없다면:
      GAP 유형 = "orphan_requirement"
      심각도 = Must면 CRITICAL, Should면 WARNING, Could면 INFO
    IF FN이 있지만 FN 상태가 "미완성"이라면:
      GAP 유형 = "incomplete_function"
      심각도 = WARNING

[통과 기준]
  - Must 요구사항: 100% FN 매핑 (0 CRITICAL)
  - Should 요구사항: 90% 이상 FN 매핑
  - Could 요구사항: 70% 이상 FN 매핑

[출력 예시]
  GAP-RTM-01 | CRITICAL | RD-FR-031 "사용자 권한 위임" → 기능정의 없음
  GAP-RTM-01 | WARNING  | RD-FR-019 "이메일 알림" → FN-017 (미완성)
```

### 1-2. FN → SC 매핑 검증

```
[규칙 ID] GAP-RTM-02
[설명] 모든 기능정의(FN-*)는 최소 1개의 화면정의(SC-*)에 연결되어야 한다.
       단, 배치/백엔드 전용 기능은 SC 없이 허용 (FN 내 명시 필요).
[입력] functional-spec.md의 FN 목록, screen-spec.md의 SC 목록

[검증 로직]
  FOR EACH FN-NNN in FN_list:
    IF SC가 없다 AND FN.type != "batch" AND FN.type != "backend_only":
      GAP 유형 = "function_without_screen"
      심각도 = WARNING
    IF FN.type == "batch" AND SC가 없다:
      GAP 유형 = "batch_no_admin_screen"
      심각도 = INFO  # 배치 모니터링 화면 권고

[통과 기준]
  - UI 기능: 100% SC 매핑
  - 배치/백엔드 기능: SC 없어도 허용 (명시 조건)

[출력 예시]
  GAP-RTM-02 | WARNING | FN-029 "다운로드 이력 조회" → 화면정의 없음
  GAP-RTM-02 | INFO    | FN-035 "야간 정산 배치" → 화면 없음 (배치로 표시됨)
```

### 1-3. FN → RD 역추적 (고아 기능 탐지)

```
[규칙 ID] GAP-RTM-03
[설명] 모든 기능정의(FN-*)는 최소 1개의 요구사항(RD-*)을 근거로 해야 한다.
       근거 없는 기능은 "골드 플레이팅" 또는 실수 가능성.
[입력] functional-spec.md의 FN-RD 역참조 컬럼

[검증 로직]
  FOR EACH FN-NNN in FN_list:
    IF RD 참조가 없다면:
      GAP 유형 = "orphan_function"
      심각도 = WARNING

[통과 기준]
  - 고아 기능(orphan_function) 0건

[출력 예시]
  GAP-RTM-03 | WARNING | FN-042 "소셜 미디어 공유" → 요구사항 근거 없음
              → 요구사항 추가 또는 기능 삭제 결정 필요
```

### 1-4. SC → FN 역추적 (고아 화면 탐지)

```
[규칙 ID] GAP-RTM-04
[설명] 모든 화면정의(SC-*)는 최소 1개의 기능정의(FN-*)에 연결되어야 한다.
       연결 없는 화면은 요구사항 범위 밖 작업 가능성.
[입력] screen-spec.md의 SC-FN 역참조 컬럼

[검증 로직]
  FOR EACH SC-NNN in SC_list:
    IF FN 참조가 없다면:
      GAP 유형 = "orphan_screen"
      심각도 = WARNING

[출력 예시]
  GAP-RTM-04 | WARNING | SC-051 "통계 대시보드 v2" → 기능정의 연결 없음
```

---

## 2. 도메인 체크리스트 Gap Detection

### 2-1. 도메인 필수 체크리스트 대조

```
[규칙 ID] GAP-DOMAIN-01
[설명] domain-profiles.md에서 로드된 도메인의 필수 체크리스트 항목이
       요구사항 목록에 존재하는지 검증한다.
[입력] 현재 도메인의 CK 목록, 수집된 RD 목록

[매핑 로직]
  각 체크리스트 항목을 키워드 매핑으로 요구사항에서 탐색:

  예: PUB-CK-04 "감사 로그"
  → RD 목록에서 다음 키워드 탐색:
    ["감사", "audit", "접근 이력", "변경 이력", "로그"]
  → 매핑된 RD가 0건이면 GAP 경고 발생

[심각도 분류]
  CK-MUST 항목 누락 → CRITICAL
  CK-SHOULD 항목 누락 → WARNING
  CK-COULD 항목 누락 → INFO

[출력 예시]
  GAP-DOMAIN-01 | CRITICAL | PUB-CK-04 "감사 로그" → 관련 요구사항 0건
  GAP-DOMAIN-01 | WARNING  | PUB-CK-02 "권한 위임" → 관련 요구사항 1건 (불명확)
```

### 2-2. 도메인 필수 NFR 검증

```
[규칙 ID] GAP-DOMAIN-02
[설명] domain-profiles.md의 NFR 항목이 RD-NFR 목록에 정량화되어 있는지 검증.

[검증 로직]
  FOR EACH domain_NFR in domain_nfr_list:
    IF RD-NFR 목록에서 해당 NFR 없음:
      GAP 유형 = "missing_nfr"
      심각도 = CRITICAL (법규 관련) or WARNING
    IF RD-NFR 있지만 정량값 없음 (예: "빠르게", "안정적으로"):
      GAP 유형 = "unquantified_nfr"
      심각도 = WARNING

[출력 예시]
  GAP-DOMAIN-02 | CRITICAL | FIN-NFR-01 "원장 정합성" → 요구사항 없음
  GAP-DOMAIN-02 | WARNING  | MED-NFR-05 "가용성" → 정량 목표 없음 (% 미정의)
```

---

## 3. 양방향 추적성 전체 검증

### 3-1. 추적성 커버리지 계산

```
[규칙 ID] GAP-TRACE-01
[설명] 전체 추적성 커버리지를 계산하여 기준 미달 시 경고.

[계산식]
  RD_to_FN_coverage = (FN 매핑된 RD 수) / (전체 RD 수) × 100
  FN_to_SC_coverage = (SC 매핑된 FN 수) / (전체 UI FN 수) × 100
  FN_to_RD_reverse  = (RD 참조 있는 FN 수) / (전체 FN 수) × 100
  SC_to_FN_reverse  = (FN 참조 있는 SC 수) / (전체 SC 수) × 100

[통과 기준]
  RD_to_FN_coverage: Must 100%, 전체 95% 이상
  FN_to_SC_coverage: 95% 이상 (배치/백엔드 제외)
  FN_to_RD_reverse: 100%
  SC_to_FN_reverse: 100%

[Phase 4 진입 차단 조건]
  RD_to_FN_coverage (Must) < 100% → Phase 4 진입 불가
  도메인 CRITICAL 체크리스트 미충족 → Phase 4 진입 불가
```

---

## 4. ISO 25010 NFR 커버리지 검증

```
[규칙 ID] GAP-NFR-01
[설명] ISO 25010의 8가지 품질 특성에 대해 RD-NFR이 최소 1건 이상 정의되었는지 검증.
       (도메인 비관련 항목은 "해당없음"으로 명시 필요)

[8가지 특성 및 필수 여부]
  1. 기능적합성 (Functional Suitability) — FR로 커버 (별도 NFR 불필요)
  2. 성능효율성 (Performance Efficiency)   — MUST: 응답시간, 처리량 정량화
  3. 호환성 (Compatibility)               — SHOULD: 연동 시스템 있으면 MUST
  4. 사용성 (Usability)                   — SHOULD: 접근성 요건 있으면 MUST
  5. 신뢰성 (Reliability)                 — MUST: 가용성(%) 정의
  6. 보안성 (Security)                    — MUST: 보안 정책 정의
  7. 유지보수성 (Maintainability)          — SHOULD
  8. 이식성 (Portability)                 — COULD

[검증 로직]
  FOR EACH iso_characteristic in MUST_list:
    IF RD-NFR 목록에 해당 특성 없음:
      GAP 유형 = "missing_iso_nfr"
      심각도 = WARNING

[출력 예시]
  GAP-NFR-01 | WARNING | ISO-25010: 신뢰성(Reliability) → 가용성 수치 미정의
  GAP-NFR-01 | WARNING | ISO-25010: 성능효율성 → 응답 시간 목표 없음
  GAP-NFR-01 | INFO    | ISO-25010: 이식성 → 해당없음으로 명시됨 (OK)
```

---

## 5. 숨은 이해관계자 Gap 탐지

```
[규칙 ID] GAP-STAKE-01
[설명] 흔히 누락되는 이해관계자 유형을 체크하여 누락 시 경고.

[체크 목록]
  □ 시스템 운영자/관리자 (Admin) 관련 요구사항 존재?
  □ 외부 연동 시스템 담당자 요구사항 존재?
  □ 감사/컴플라이언스 담당자 요구사항 존재?
  □ 경영진 리포팅 요구사항 존재?
  □ 일반 최종 사용자 요구사항 존재?
  □ 시스템 유지보수 담당자 요구사항 존재?

[출력 예시]
  GAP-STAKE-01 | WARNING | "시스템 관리자" 이해관계자 → 관련 RD 0건
               → 관리자 화면, 설정 기능, 모니터링 요구사항 확인 필요

  GAP-STAKE-01 | WARNING | "경영진 보고" 이해관계자 → 대시보드/리포팅 RD 0건
```

---

## 6. Gap 보고서 출력 형식

### 표준 Gap Report 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GAP DETECTION REPORT
 도메인: 공공 | 실행 시각: 2026-03-29 14:30:00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 [요약]
 총 Gap 발견: 8건 (CRITICAL: 2, WARNING: 4, INFO: 2)
 RTM 커버리지: RD→FN 93.8% ⚠️ | FN→SC 96.7% ✅ | 역추적 100% ✅
 도메인 체크: 13/15 통과 ❌ (2건 미통과)
 NFR 커버리지: 6/8 ISO 특성 ⚠️

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [CRITICAL] — 즉시 해결 필요
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 [1] GAP-DOMAIN-01 | PUB-CK-04 "감사 로그"
     내용: 공공 도메인 필수 항목 '감사 로그'에 해당하는 RD 없음
     영향: 감사 추적 미구현 시 법적 문제 가능
     조치: 요구사항 추가 또는 의도적 제외 사유 문서화

 [2] GAP-RTM-01 | RD-FR-031 "사용자 권한 위임"
     내용: Must 요구사항에 매핑된 기능정의 없음
     영향: 해당 요구사항 미구현
     조치: FN 추가 정의 필요

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [WARNING] — 검토 후 처리
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 [3] GAP-RTM-02 | FN-029 "다운로드 이력 조회"
     내용: UI 기능에 매핑된 화면정의 없음
     조치: SC 추가 또는 기존 SC에 기능 통합

 [4] GAP-NFR-01 | ISO-25010: 신뢰성 (Reliability)
     내용: 가용성 정량 목표 (SLA) 미정의
     조치: RD-NFR-XXX 추가 필요 (예: 99.5% 이상)

 [5] GAP-STAKE-01 | "시스템 관리자" 이해관계자
     내용: 관리자 관련 요구사항 0건
     조치: 관리자 기능 범위 확인 후 RD 추가 또는 범위 밖 명시

 [6] GAP-DOMAIN-01 | PUB-CK-02 "권한 위임"
     내용: 관련 요구사항 있으나 구체성 부족
     조치: RD-FR-015 상세화 필요

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [INFO] — 선택적 검토
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 [7] GAP-RTM-02 | FN-035 "야간 정산 배치"
     내용: 배치 기능에 모니터링 화면 없음 (경고 아닌 권고)
     조치: 배치 모니터링 화면 추가 권장

 [8] GAP-NFR-01 | ISO-25010: 이식성 (Portability)
     내용: 이식성 NFR 미정의
     조치: "해당없음" 명시 또는 RD-NFR 추가

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [사용자 결정 필요]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 CRITICAL 항목 2건에 대해 결정을 내려주세요:

 [1] PUB-CK-04 "감사 로그":
     A) 요구사항 추가 (권장) → Phase 1로 돌아가 추가 수집
     B) 의도적 제외 → 사유 문서화 후 진행

 [2] RD-FR-031 "사용자 권한 위임":
     A) 기능정의 추가 → FN 목록에 추가
     B) Won't로 재분류 → 범위에서 제외

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Gap 처리 결과 기록 형식

```
# Gap 처리 이력 (si-state.json 내 저장)

{
  "gap_history": [
    {
      "gap_id": "GAP-DOMAIN-01-PUB-CK-04",
      "detected_at": "2026-03-29T14:30:00",
      "resolved_at": "2026-03-29T15:00:00",
      "resolution": "added_requirement",
      "new_rd_id": "RD-FR-033",
      "resolved_by": "user"
    },
    {
      "gap_id": "GAP-RTM-01-RD-FR-031",
      "detected_at": "2026-03-29T14:30:00",
      "resolved_at": "2026-03-29T15:05:00",
      "resolution": "reclassified_to_wont",
      "reason": "2차 구축 범위로 이관",
      "resolved_by": "user"
    }
  ]
}
```

---

## 7. Gap Detection 실행 트리거 및 자동화

### 실행 트리거

```
자동 실행 조건:
  1. Phase 2 Step 4 진입 시 (항상)
  2. --gap 플래그 단독 실행
  3. --add 완료 후 (신규 요구사항 추가 시)
  4. --change 승인 후 (요구사항 변경 시)
  5. Phase 4 검증 전 (최종 검증)

수동 실행:
  /si-planning --gap
```

### 점진적 Gap Detection

```
--add 시 점진적 실행:
  - 신규 추가된 RD에 대해서만 GAP-RTM-01 실행
  - 전체 도메인 체크는 재실행 (새 요구사항이 기존 GAP 해소 가능)

--change 시 점진적 실행:
  - 변경된 RD에 연결된 FN/SC만 재검증
  - 영향 받는 추적성 체인만 재계산
```

### Phase 진입 차단 조건 요약

```
Phase 2 → Phase 3 진입 차단:
  - CRITICAL Gap 미해소 (요구사항 추가 또는 의도적 제외 미결정)

Phase 3 → Phase 4 진입 차단:
  - Must 요구사항 RD→FN 커버리지 < 100%
  - 도메인 CRITICAL 체크리스트 항목 미충족
  - 산출물 파일 4개 미생성

Phase 4 → 완료 차단:
  - 사용자 최종 확인 미완료
  - CRITICAL Gap 미해소 (최종)
```
