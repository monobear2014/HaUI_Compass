from copy import deepcopy


class InMemoryTicketBoardRepository:
    def __init__(self) -> None:
        self.values: dict[tuple[str, str], dict[str, object]] = {}

    def get(self, owner: str, scope: str) -> dict[str, object] | None:
        return deepcopy(self.values.get((owner, scope)))

    def save(self, owner: str, scope: str, value: dict[str, object], version: int) -> bool:
        old = self.values.get((owner, scope))
        if (old or {}).get("version", 0) != version:
            return False
        self.values[(owner, scope)] = deepcopy(value)
        return True
