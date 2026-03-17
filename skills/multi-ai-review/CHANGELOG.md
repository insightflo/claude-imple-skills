# Changelog

All notable changes to the multi-ai-review skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2026-03-17

### Added
- **Chairman Evidence Weighting Rules** — 5 core rules for scoring arbitration:
  - Evidence Hierarchy: file:line citations outrank structural impressions
  - Verification Required: score increases require repo verification
  - Pre-Deploy Done-When: grep checks before deployment
  - Delta Arbitration: mandatory verification when score gap ≥15
  - Domain Weighting: Codex 2× weight in code-review/project-gate when verified
- Done-When verification to presets (code-review, project-gate)
- Evidence-Verified column in Score Card
- Done-When 검증 결과 섹션 in report template

### Changed
- Updated member prompt template to require file:line evidence
- Updated report template to v4.1 with evidence verification fields
- Updated Chairman Protocol to include Evidence Extraction step

### Fixed
- Chairman now arbitrates score gaps instead of simple averaging
- Pre-deploy verification blocks deployment when Done-When checks fail

## [4.0.0] - 2026-03-16

### Added
- Universal consensus engine across all domains
- Domain auto-routing with preset system
- Score Card system with grade thresholds (A-F)
- Severity labels (Critical, High, Medium, Low)
- CI Quality Gate with configurable thresholds
- 15+ domain presets (code-review, market-regime, investment, etc.)

### Changed
- Complete rewrite from v3.x CLI-based approach
- Simplified configuration with YAML presets

## [3.3.0] - Previous

### Added
- Chairman Protocol with automatic additional Cross-Review rounds
- Focused question generation for unresolved issues
- Infinite loop prevention (max 3 rounds)
