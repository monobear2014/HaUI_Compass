"""Provider-neutral failure types for untrusted language-model output."""


class InvalidLLMOutputError(ValueError):
    """A provider responded, but its output could not satisfy the internal contract."""
