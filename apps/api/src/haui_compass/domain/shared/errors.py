"""Errors raised by the domain layer."""


class DomainValidationError(ValueError):
    """A domain object was constructed with values that break one of its invariants."""
