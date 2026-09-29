# Local Research-Data Storage Plan — Protocol v1

Do not create participant responses in the repository. Before any participant data is stored, use this local layout; `research-data/` is ignored by Git.

```text
research-data/
├── raw/
│   ├── P01/
│   ├── P02/
│   └── ... P15/
├── processed/
└── aggregate/
```

- `raw/Pxx/`: completed observation sheet, questionnaire, de-identified notes, and structured answer-key snapshot for that participant only.
- `processed/`: derived, pseudonymous analysis tables; no names or consent forms.
- `aggregate/`: non-identifying aggregate outputs intended for reporting.
- Keep consent records outside this tree and separate from the pseudonymous study records.
- Never store names, emails, student IDs, classes, universities, passwords, or LMS credentials in participant IDs or this layout.
- Retain raw/pseudonymous data for six months after thesis/project completion, then delete it. Aggregated anonymized results may remain in the thesis/project report.
