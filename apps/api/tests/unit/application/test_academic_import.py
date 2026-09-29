from datetime import UTC, datetime

import pytest

from haui_compass.application.academic_import import (
    AcademicImportError,
    AcademicImportErrorCode,
    AcademicSource,
    ImportedAcademicDataProvider,
    dataset_from_values,
)
from haui_compass.application.ports.lms import SubmissionStatus


def dataset():
    return dataset_from_values(
        student_id="pilot-student",
        source=AcademicSource.JSON_IMPORT,
        courses=(("c1", "Databases", "DB1"),),
        assignments=(("a1", "c1", "Schema report", datetime(2026, 10, 8, tzinfo=UTC), 90),),
        submissions=(("a1", SubmissionStatus.NOT_SUBMITTED, None),),
    )


def test_imported_records_are_lms_compatible_and_exact_retry_is_idempotent() -> None:
    provider = ImportedAcademicDataProvider()
    first = dataset()
    assert provider.replace(first) is False
    assert provider.replace(first) is True
    assert provider.get_courses(first.student)[0].ref.provider == "json"
    assert provider.get_assignments(first.student)[0].estimated_effort is not None


def test_orphan_assignment_is_rejected_before_any_dataset_can_be_stored() -> None:
    with pytest.raises(AcademicImportError) as error:
        dataset_from_values(
            student_id="pilot-student",
            source=AcademicSource.CSV_IMPORT,
            courses=(("c1", "Databases", None),),
            assignments=(("a1", "missing", "Report", datetime(2026, 10, 8, tzinfo=UTC), None),),
            submissions=(),
        )
    assert error.value.code is AcademicImportErrorCode.ORPHAN_ASSIGNMENT


def test_changed_reimport_is_an_explicit_conflict() -> None:
    provider = ImportedAcademicDataProvider()
    provider.replace(dataset())
    changed = dataset_from_values(
        student_id="pilot-student",
        source=AcademicSource.JSON_IMPORT,
        courses=(("c1", "Databases", "DB1"),),
        assignments=(("a1", "c1", "Changed title", datetime(2026, 10, 8, tzinfo=UTC), 90),),
        submissions=(("a1", SubmissionStatus.NOT_SUBMITTED, None),),
    )
    with pytest.raises(AcademicImportError) as error:
        provider.replace(changed)
    assert error.value.code is AcademicImportErrorCode.CONFLICT
