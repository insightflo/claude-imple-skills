# Coverage Tech Specs

> Test runner configuration and commands by language

## Python (pytest-cov)

### Configuration File

**`pytest.ini` or `pyproject.toml`:**

```ini
[tool:pytest]
addopts = --cov=app --cov-report=html --cov-report=term-missing
testpaths = tests
```

### Commands

```bash
# Basic coverage
pytest --cov=app

# Generate JSON report
pytest --cov=app --cov-report=json

# HTML report
pytest --cov=app --cov-report=html

# Run after clearing cache
pytest --cov=app --cov-erase
```

---

## Node.js (Vitest)

### Configuration File

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

### Commands

```bash
# Coverage report
npm run test -- --coverage

# JSON report
npm run test -- --coverage --coverage.reporter=json
```

---

## Node.js (Jest)

### Configuration File

**`jest.config.js`:**

```javascript
module.exports = {
  collectCoverage: true,
  coverageReporters: ['text', 'json', 'html'],
  collectCoverageFrom: ['src/**/*.{ts,js}'],
};
```

### Commands

```bash
npm test -- --coverage
```

---

## Rust (cargo-tarpaulin)

### Installation

```bash
cargo install cargo-tarpaulin
```

### Commands

```bash
# JSON report
cargo tarpaulin --out Json --output-dir coverage

# Text report
cargo tarpaulin --out Stdout
```

---

## Go

### Tool

`go test` + `go-cover`

### Commands

```bash
# Generate coverage profile
go test -coverprofile=coverage.out ./...

# Text report
go tool cover -func=coverage.out

# HTML report
go tool cover -html=coverage.out
```

---

## Storage Structure

Location where coverage data is stored:

```
project-root/
├── .claude/
│   ├── coverage/
│   │   ├── coverage.json         # Current coverage data
│   │   ├── coverage-history.json # Coverage change history
│   │   └── coverage-report.md    # Previous analysis report
│   │
│   └── cache/
│       └── coverage-cache/       # Calculation cache
│
├── coverage/                      # Tool-generated directories
│   ├── .coverage               # Python
│   ├── htmlcov/               # Python HTML
│   ├── lcov-report/           # JavaScript HTML
│   └── coverage.out           # Go
│
└── [tool-specific-dirs]/
```

---

## Caveats

### Caching Issues

Coverage may cache results from previous runs.

```bash
# Run after clearing cache
pytest --cov=app --cov-erase
```

### Exclusion Rules

Files and directories excluded in configuration will be omitted from coverage.

```bash
# Check configuration file
grep -E "omit|exclude" pytest.ini pyproject.toml package.json
```

### Parallel Tests

Coverage results may be inaccurate when running tests in parallel.

```bash
# Sequential execution is recommended
pytest --cov=app -n 0
```

### Generated Code

Auto-generated code (migrations, protocol buffers, etc.) is typically excluded.

---

## References

| Tool | Documentation |
|------|---------------|
| pytest-cov | https://pytest-cov.readthedocs.io/ |
| Vitest coverage | https://vitest.dev/coverage.html |
| Jest coverage | https://jestjs.io/docs/coverage |
| cargo-tarpaulin | https://github.com/xd009642/tarpaulin |
| Go coverage | https://golang.org/doc/effective_go#testing |
