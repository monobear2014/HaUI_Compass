"""Read-only access to reviewed public learning resources."""

from typing import Protocol


class PublicCourseware(Protocol):
    def courses(self) -> list[dict[str, object]]: ...

    def materials(self, course_id: str) -> list[dict[str, object]]: ...

    def read(self, course_id: str, slug: str, page: int) -> dict[str, object]: ...
