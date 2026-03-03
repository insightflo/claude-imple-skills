# Context Optimizer Services

Long Context 최적화를 위한 서비스 모듈입니다.

## 구성 요소

### 1. contextOptimizer.js

컨텍스트 옵티마이저 핵심 모듈입니다.

#### 기능

| 함수 | 설명 |
|------|------|
| `extractHeavyHitters(content, options)` | 핵심 토큰 추출 (H2O 패턴) |
| `structureContext(contexts, options)` | 구조화된 컨텍스트 배치 |
| `compressContent(content, options)` | 중요도별 압축 |
| `buildPrompt(contexts, prompt, options)` | 최적화된 프롬프트 빌드 |
| `ragHybridPipeline(query, documents, options)` | RAG 하이브리드 파이프라인 |

#### CLI 사용법

```bash
# 파일 최적화 (Heavy-Hitter 추출)
node contextOptimizer.js optimize <file>

# 내용 압축
node contextOptimizer.js compress <file> --summary-ratio=0.3

# RAG 하이브리드 쿼리 빌드
node contextOptimizer.js build "<query>" <file1> <file2>
```

#### Module 사용법

```javascript
const {
  extractHeavyHitters,
  compressContent,
  buildPrompt
} = require('./contextOptimizer.js');

// Heavy-Hitter 추출
const { heavyHitters } = extractHeavyHitters(code, {
  maxCount: 10
});

// 압축
const compressed = compressContent(longText, {
  summaryRatio: 0.3,
  preserveLines: 5
});

// 최적화된 프롬프트
const prompt = buildPrompt(contexts, userQuery, {
  maxTokens: 8000
});
```

---

### 2. mcp-context-server.js

MCP (Model Context Protocol) 서버입니다.

#### 제공 도구 (Tools)

| 도구 | 설명 |
|------|------|
| `compress_context` | H2O 패턴으로 컨텍스트 압축 |
| `extract_heavy_hitters` | 핵심 토큰 추출 |
| `build_optimized_prompt` | 최적화된 프롬프트 빌드 |

#### MCP 서버 실행

```bash
node mcp-context-server.js serve
```

#### 클라이언트 설정 (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "context-optimizer": {
      "command": "node",
      "args": [
        "/path/to/project-team/services/mcp-context-server.js",
        "serve"
      ]
    }
  }
}
```

---

## 기술 원리

### H2O (Heavy-Hitter Oracle)

핵심 정보를 문서 상단에 배치하여 "Lost in the Middle" 현상 완화:

1. 함수/클래스 정의 감지
2. 마크다운 헤더 추출
3. 리스트/항목 식별
4. 중요도 순 정렬

### Compressive Context

오래된/덜 중요한 컨텍스트를 요약하면서 최신/핵심 정보는 원본 유지:

1. 헤더/푸터 보존 (각각 N줄)
2. 중간 섹션 샘플링
3. 압축 마커 삽입 (`... (compressed)`)

### RAG 하이브리드

검색 → 우선순위 → 압축 → 종합 파이프라인:

```
Retrieve (키워드 매칭)
    ↓
Prioritize (관련도 + 신선도 + 타입 보너스)
    ↓
Compress (Compressive Context)
    ↓
Synthesize (최종 프롬프트)
```

---

## 설정 옵션

```javascript
{
  maxTokens: 8000,        // 타겟 토큰 제한
  heavyHitterCount: 10,   // 추출할 핵심 통찰 수
  summaryRatio: 0.3,      // 압축 비율 (0-1)
  preserveLines: 5,       // 경계 보존 라인 수
  threshold: 0.1          // RAG 검색 임계값
}
```

---

## 사용 예시

### SKILL에서 활용

```bash
# 긴 문서 최적화
/optimize docs/long-document.md

# 여러 파일 통합
/build "요약해줘" docs/*.md
```

### Agent 간 통신 (a2a)

```javascript
// 긴 컨텍스트를 압축하여 전송
const optimized = buildContext( [
  { source: 'agent-a', content: longOutput1 },
  { source: 'agent-b', content: longOutput2 }
], query);
```

---

## 참고 자료

- [Plan 문서](../../../docs/plan/long-context-optimization.md)
- NotebookLM: `aa6bc66e-6c4a-4359-981b-f00e578c6710`
