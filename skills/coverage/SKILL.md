---
name: coverage
description: 테스트 커버리지 조회/분석. 수정 전 커버리지 확인, PR 전 미커버 파일 식별, 커버리지 트렌드 추적에 반드시 사용하세요. '커버리지', '테스트 통과', '미커버 영역', '테스트 추가' 키워드에 즉시 실행.
version: 2.3.0
updated: 2026-03-12
---

# 🧪 Test Coverage Map

> **목적**: 테스트 커버리지를 조회하고 **미커버 영역을 식별**하며 **커버리지 트렌드를 추적**합니다.
>
> **역할 분담:**
> | 스킬 | 시점 | 범위 |
> |------|------|------|
> | **`/coverage` (이 스킬)** | **수정 전/후, 정기 조회** | **커버리지 현황 + 미커버 영역 + 트렌드** |
> | `/audit` | 배포 전 | 종합 감사 |
> | `/impact` | 수정 전 | 영향도 분석 |

---

## ⛔ 절대 금지 사항

1. ❌ **직접 코드를 수정하지 마세요** - 수정은 `implementation agent`의 역할
2. ❌ **테스트 설정을 변경하지 마세요** - 커버리지 분석만 수행
3. ❌ **임의로 커버리지 기준을 내리지 마세요** - 기획 문서의 기준을 따름

---

## ✅ 스킬 발동 시 즉시 실행할 행동

```
1. 프로젝트 타입 감지 (Python/Node.js/Rust/Go 등)
2. 테스트 환경 확인
3. 커버리지 데이터 수집
4. 미커버 파일/영역 식별
5. 커버리지 트렌드 분석 (가능한 경우)
6. 리포트 생성 및 권장사항 제시
```

---

## 🛠️ 명령어

| 명령어 | 설명 |
|--------|------|
| `/coverage` | 전체 프로젝트 커버리지 조회 |
| `/coverage <path>` | 특정 디렉토리/파일 커버리지 |
| `/coverage --uncovered` | 미커버 영역만 표시 |
| `/coverage --threshold <n>` | n% 미만 파일 표시 |
| `/coverage --trend` | 커버리지 트렌드 (7일/30일) |
| `/coverage --function <file>` | 파일별 함수 커버리지 |
| `/coverage --branch` | 브랜치 커버리지 상세 |
| `/coverage --report` | 상세 HTML 리포트 생성 |

---

## 🏗️ 실행 프로세스

### 1단계: 프로젝트 타입 감지

```bash
ls pyproject.toml setup.py requirements.txt 2>/dev/null && echo "Python"
ls package.json 2>/dev/null && echo "Node.js"
ls Cargo.toml 2>/dev/null && echo "Rust"
ls go.mod 2>/dev/null && echo "Go"
```

### 2단계: 커버리지 데이터 수집

| 프로젝트 | 명령어 |
|----------|--------|
| **Python** | `pytest --cov=. --cov-report=json --cov-report=term-missing` |
| **Node.js (Vitest)** | `npm run test -- --coverage` |
| **Node.js (Jest)** | `npm run test -- --coverage` |
| **Rust** | `cargo tarpaulin --out Json` |
| **Go** | `go test -coverprofile=coverage.out ./...` |

### 3단계: 미커버 영역 식별

커버리지 리포트에서:
- **미커버 라인** 식별
- **미커버 브랜치** 식별
- **미커버 함수** 식별

---

## 📊 권장 사항 기준

| 커버리지 | 판정 | 조치 |
|----------|------|------|
| **80%+** | ✅ 우수 | 유지보수 시 수준 유지 |
| **70-80%** | ⚠️ 개선 | 예외/엣지 케이스 테스트 추가 |
| **70% 미만** | ❌ 낮음 | `/coverage --uncovered`로 확인 후 테스트 추가 |

---

## 🔗 관련 스킬 연동

| 스킬 | 연동 시점 | 용도 |
|------|-----------|------|
| `/impact <file>` | 변경 전 | 영향도 분석 후 커버리지 확인 |
| `/audit` | 배포 전 | 종합 감사 중 커버리지 검증 |
| `/checkpoint` | 태스크 완료 | 코드 리뷰 시 커버리지 체크 |

---

## 📚 참조 문서

상세 출력 예시, 언어별 설정, 활용 시나리오는 다음 파일을 참조하세요:

- `references/output-formats.md` - 출력 형식 상세
- `references/tech-specs.md` - 언어별 테스트 러너 설정
- `references/scenarios.md` - 활용 시나리오 및 통합 예제

---

**Last Updated**: 2026-03-12 (v2.3.0 - Progressive Disclosure 적용)
