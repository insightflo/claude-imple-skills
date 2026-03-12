# Coverage Scenarios

> 활용 시나리오 및 통합 예제

## Scenario 1: PR 검토 전 커버리지 확인

```bash
# 1. 전체 커버리지 확인
/coverage

# 2. 기준 미달 파일 식별
/coverage --threshold 80

# 3. 특정 파일 상세 분석
/coverage app/services/order_service.py --uncovered

# 결과: "이 파일은 78% 커버리지입니다.
#        다음 테스트 추가를 권장합니다: L45-48, L67-70"
```

## Scenario 2: 버그 수정 후 테스트 커버리지 확보

```bash
# 1. 수정할 파일의 현재 커버리지 확인
/coverage app/services/payment_service.py

# 결과: 75% 커버리지

# 2. 미커버 영역 확인
/coverage app/services/payment_service.py --uncovered

# 결과: 다음 영역 미커버
#       - L34-37: 환불 처리 로직
#       - L65-68: 부분 결제 처리

# 3. 버그 수정 + 테스트 추가

# 4. 개선 확인
/coverage app/services/payment_service.py

# 결과: 65% → 88% 개선
```

## Scenario 3: 도메인별 커버리지 현황 파악

```bash
# 1. order 도메인 전체 커버리지
/coverage order/ --report

# 2. 서비스별 상세 분석
/coverage order/services/
/coverage order/models/
/coverage order/validators/

# 3. 트렌드 추적
/coverage order/ --trend

# 결과: 지난달부터 10% 상승, 목표까지 5% 남음
```

## Scenario 4: 새 기능 추가 시 테스트 체크리스트

```bash
# 1. 기능 구현
[구현 진행]

# 2. 함수별 커버리지 확인
/coverage --function <new_module.py>

# 3. 각 함수가 100% 커버되도록 테스트 추가
# (성공 경로 + 예외 경로 모두)

# 4. 전체 프로젝트 커버리지 확인
/coverage

# 5. 기준 이상 달성 시 PR 오픈
```

---

## 통합 예제

### 커버리지 확인 + 개선 워크플로우

```bash
# 1단계: 현재 상태 확인
/coverage
# 결과: 82% 커버리지

# 2단계: 미달 파일 식별
/coverage --threshold 80
# 결과: 3개 파일 80% 미만

# 3단계: 첫 번째 파일 분석
/coverage app/utils/validators.py --uncovered
# 결과: L12-18, L45-50 미커버

# 4단계: 테스트 추가 (개발자)
[Test 추가 작업]

# 5단계: 개선 확인
/coverage app/utils/validators.py
# 결과: 65% → 88% 개선

# 6단계: 전체 커버리지 재확인
/coverage
# 결과: 82% → 85% 달성 ✅
```

---

## 관련 스킬 연동

### `/impact <file>` (영향도 분석 후 커버리지 확인)

```
/impact app/services/order_service.py
  ↓
[영향도 분석 출력]
  ↓
💡 권장: /coverage app/services/ --uncovered
  (변경되는 영역의 테스트 커버리지 확인)
```

### `/audit` (배포 전 종합 감사 중 커버리지 검증)

```
/audit
  ↓
[1단계: 기획 검증]
[2단계: DDD 검증]
[3단계: 코드 품질]
  ↓
/coverage (자동 실행)
  ↓
[커버리지 리포트]
  ↓
커버리지 80% 미만 시 감사 차단
```

### `/maintenance-analyst` (유지보수 전 커버리지 확인)

```
사용자: "payment 로직 수정해줘"
  ↓
/impact payment_service.py
  ↓
"현재 커버리지: 78%입니다. 수정 전 테스트를 실행해주세요."
  ↓
/coverage payment_service.py (현재 상태 저장)
  ↓
[수정 진행]
  ↓
/coverage payment_service.py (수정 후 상태 비교)
  ↓
"커버리지 유지 확인 완료 ✅"
```

---

## 권장 사항 생성 로직

### 파일별 권장사항

**80% 초과:**
```
✅ 우수한 테스트 커버리지입니다.
   유지보수 시 이 수준을 유지해주세요.
```

**70-80%:**
```
⚠️ 개선 여지가 있습니다.
   다음 영역의 테스트 추가를 권장합니다:
   - 예외 처리 경로
   - 엣지 케이스
   - 조건부 분기
```

**70% 미만:**
```
❌ 커버리지가 낮습니다.
   /coverage --uncovered [파일] 명령으로 미커버 영역을 확인하고
   다음 순서로 테스트를 추가해주세요:
   1. 주요 기능 (happy path)
   2. 예외 처리
   3. 엣지 케이스
```

### 도메인별 분석

```
💡 order 도메인 분석:
   ├── services/: 95% ✅ (테스트 충분)
   ├── models/:   78% ⚠️ (모델 검증 테스트 추가 권장)
   └── validators/: 65% ❌ (입력 검증 테스트 필요)

   → 다음 스프린트에서 validators 커버리지 80% 이상으로 개선 권장
```

### 트렌드 기반 권장사항

**상승 추이 (good):**
```
📈 좋은 추이입니다! 이 모멘텀을 유지해주세요.
   지난주 +3%에서 이번주 +2% 증가
   → 목표: 3주 내 85% 달성 가능
```

**하락 추이 (warning):**
```
📉 커버리지가 감소했습니다.
   지난주: 85% → 이번주: 82% (-3%)
   새로운 코드 추가 시 테스트도 함께 작성해주세요.
```

---

## Best Practices

1. **정기적 확인**: 매 스프린트 종료 시 커버리지 확인
2. **목표 설정**: 도메인별로 커버리지 목표 설정 (보통 80%)
3. **트렌드 모니터링**: 커버리지 하락 추이 주시
4. **점진적 개선**: 급격한 개선보다는 꾸준한 증가 추구
5. **팀 논의**: 커버리지 목표를 팀과 함께 결정
