# Public courseware ingestion and reading

Implemented 2026-10-19 for student `/knowledge`.

The twelve new documents are unchanged publisher originals, not generated mock lectures:
six MIT OpenCourseWare PDFs and six revision-pinned Dive into Deep Learning Markdown chapters.
They cover AI, ML, linear algebra, probability/statistics and automatic control. Full provenance,
authors, original URLs, license URLs, collection dates, byte counts and SHA-256 checksums are
registered in `data/manifest.json`; the attribution inventory is in `data/README.md`.
Existing synthetic assignments, student identities and deadlines remain labelled demo data.

## Runtime

- Manifest ingestion checks source hashes. Bounded PDF extraction preserves physical page numbers;
  reviewed bundled PDFs are cached by path and content hash. Uploads still use their isolated worker.
  `fonttools` supports the CFF fonts in the original course PDFs.
- `PublicCourseware` is an application port with a local manifest adapter. Both in-memory and
  PostgreSQL composition roots wire it. HTTP handlers do not depend directly on infrastructure.
- Catalog/read endpoints expose only registered `open_educational` documents. Paths, course scope,
  file hashes and page bounds are checked. Unregistered files and wrong-course slugs return 404;
  changed source bytes return 503. The existing authenticated proxy and lecturer role guard apply.
- Reader renders text without executing source Markdown/HTML. Source-page, original-file and
  license links are separate actions. PDF paging uses physical page indices; diagrams and formulas
  remain available in the original. The original files themselves are not rewritten.
- UI queries in AI/ML/LA/stats/control send `public_only: true`; the retriever applies the source-type
  filter before ranking. Legacy callers keep the old default for existing demo evaluations.
  Explicit Vietnamese/English subject terms improve lexical recall without generating evidence.
- Citation provenance includes `open_educational`, source URL and physical PDF page/Markdown section.
  Insufficient evidence and academic-integrity guidance retain their existing abstention paths.

## Reproducibility and validation

`python scripts/restore_public_courseware.py` verifies original bytes offline. The optional
`--restore-missing` downloads only missing originals from the pinned publisher URLs and refuses a
hash mismatch. It never rewrites manifest checksums to accept changed upstream content.

Validation completed: 1,689 backend tests including PostgreSQL, Ruff, mypy; 13 corpus tests and
manifest coverage/hash validation; 25/25 existing offline RAG contract cases; ten desktop/mobile
Playwright cases for source reading, PDF paging, citations, scope changes and existing Q&A states;
frontend TypeScript, scoped ESLint and production build. Offline RAG metrics are engineering contract
checks, not a research-grade quality claim or a measured improvement in learning outcomes.

These historical English materials are external courseware, not an official HaUI curriculum.
MIT documents retain CC BY-NC-SA 4.0 terms; D2L retains CC BY-SA 4.0. Dates of source semesters
and collection are distinct. Search remains bounded lexical retrieval, not a vector database,
and PDF text preview does not guarantee faithful mathematical layout or OCR.
