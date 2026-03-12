# Coverage Tech Specs

> 언어별 테스트 러너 설정 및 명령어

## Python (pytest-cov)

### 설정 파일

**`pytest.ini` 또는 `pyproject.toml`:**

```ini
[tool:pytest]
addopts = --cov=app --cov-report=html --cov-report=term-missing
testpaths = tests
```

### 명령어

```bash
# 기본 커버리지
pytest --cov=app

# JSON 리포트 생성
pytest --cov=app --cov-report=json

# HTML 리포트
pytest --cov=app --cov-report=html

# 캐시 초기화 후 실행
pytest --cov=app --cov-erase
```

---

## Node.js (Vitest)

### 설정 파일

**`vitest.config.ts`:**

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});
```

### 명령어

```bash
# 커버리지 리포트
npm run test -- --coverage

# JSON 리포트
npm run test -- --coverage --coverage.reporter=json
```

---

## Node.js (Jest)

### 설정 파일

**`jest.config.js`:**

```javascript
module.exports = {
  collectCoverage: true,
  coverageReporters: ['text', 'json', 'html'],
  collectCoverageFrom: ['src/**/*.{ts,js}'],
};
```

### 명령어

```bash
npm test -- --coverage
```

---

## Rust (cargo-tarpaulin)

### 설치

```bash
cargo install cargo-tarpaulin
```

### 명령어

```bash
# JSON 리포트
cargo tarpaulin --out Json --output-dir coverage

# 텍스트 리포트
cargo tarpaulin --out Stdout
```

---

## Go

### 도구

`go test` + `go-cover`

### 명령어

```bash
# 커버리지 프로필 생성
go test -coverprofile=coverage.out ./...

# 텍스트 리포트
go tool cover -func=coverage.out

# HTML 리포트
go tool cover -html=coverage.out
```

---

## 저장 구조

커버리지 데이터 저장 위치:

```
project-root/
├── .claude/
│   ├── coverage/
│   │   ├── coverage.json         # 현재 커버리지 데이터
│   │   ├── coverage-history.json # 커버리지 변화 이력
│   │   └── coverage-report.md    # 이전 분석 리포트
│   │
│   └── cache/
│       └── coverage-cache/       # 계산 캐시
│
├── coverage/                      # 도구별 생성 디렉토리
│   ├── .coverage               # Python
│   ├── htmlcov/               # Python HTML
│   ├── lcov-report/           # JavaScript HTML
│   └── coverage.out           # Go
│
└── [tool-specific-dirs]/
```

---

## 주의사항

### 캐싱 문제

커버리지는 이전 실행 결과를 캐시할 수 있습니다.

```bash
# 캐시 초기화 후 실행
pytest --cov=app --cov-erase
```

### 제외 규칙 확인

설정에서 제외된 파일/디렉토리는 커버리지에서 빠집니다.

```bash
# 설정 파일 확인
grep -E "omit|exclude" pytest.ini pyproject.toml package.json
```

### 병렬 테스트

병렬 실행 시 커버리지 결과가 부정확할 수 있습니다.

```bash
# 순차 실행 권장
pytest --cov=app -n 0
```

### 생성된 코드

자동 생성된 코드(migrations, 프로토콜 버퍼 등)는 일반적으로 제외됩니다.

---

## 참고 자료

| 도구 | 문서 |
|------|------|
| pytest-cov | https://pytest-cov.readthedocs.io/ |
| Vitest coverage | https://vitest.dev/coverage.html |
| Jest coverage | https://jestjs.io/docs/coverage |
| cargo-tarpaulin | https://github.com/xd009642/tarpaulin |
| Go coverage | https://golang.org/doc/effective_go#testing |
