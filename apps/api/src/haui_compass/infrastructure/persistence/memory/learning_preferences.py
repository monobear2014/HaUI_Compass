from copy import deepcopy


class InMemoryLearningPreferenceRepository:
    def __init__(self) -> None:
        self._values: dict[str, dict[str, object]] = {}

    def get(self, owner: str) -> dict[str, object] | None:
        return deepcopy(self._values.get(owner))

    def save(self, owner: str, value: dict[str, object]) -> None:
        self._values[owner] = deepcopy(value)

    def delete(self, owner: str) -> None:
        self._values.pop(owner, None)
