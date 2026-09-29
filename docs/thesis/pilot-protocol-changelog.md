# Thesis Pilot Protocol Changelog

## Controlled Thesis Pilot Protocol v1.1

**Status: FROZEN FOR PILOT**

### Change from v1.0

DRYRUN-01 preparation identified an internal semantic contradiction: v1.0 stated that five study tasks existed initially while T2 required participants to create one of those tasks.

v1.1 resolves this fixture/task-state error only: five assignments exist initially, four study tasks exist initially, and T2 explicitly creates the fifth study task, `Summarise two articles`, estimated at 45 minutes for the Academic Skills Reading response assignment. Assignment and Study Task remain distinct concepts.

Research questions, hypotheses, participant criteria, SUS, custom questionnaire, metrics, and analysis plan are unchanged. No participant data had been collected, so there is no dataset compatibility issue.

## Controlled Thesis Pilot Protocol v1.2

**Status: FROZEN FOR PILOT**

### Change from v1.1

The canonical scenario explicitly names four distinct courses—Algorithms, Databases, Machine Learning, and Academic Skills—while v1.1 incorrectly stated three.

v1.2 changes course-count metadata only: the initial state has four courses, five assignments, and four study tasks; T2 creates the fifth task. No participant data has been collected.

## Controlled Thesis Pilot Protocol v1.3

**Status: FROZEN FOR PILOT**

### Change from v1.2

The exact canonical StudyWindows total 5.0 hours (18,000 seconds), while v1.2 incorrectly declared a larger aggregate. v1.3 makes the StudyWindows authoritative and derives total capacity from them; capacity is not independently editable. This is capacity metadata only. No participant data has been collected.
