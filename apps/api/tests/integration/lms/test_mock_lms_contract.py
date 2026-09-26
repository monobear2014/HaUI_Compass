"""MockLMSProvider against the shared LMSProvider contract."""

import pytest

from haui_compass.application.ports.lms import ExternalRef, LMSProvider
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.lms.mock_data import MAIN_STUDENT, PROVIDER
from support.builders import NOW
from support.lms_contract import LMSProviderContract


class TestMockLMSProviderContract(LMSProviderContract):
    @pytest.fixture
    def provider(self) -> LMSProvider:
        return MockLMSProvider.canonical(anchor=NOW)

    @pytest.fixture
    def student(self) -> ExternalRef:
        return MAIN_STUDENT

    @pytest.fixture
    def unknown_student(self) -> ExternalRef:
        return ExternalRef(PROVIDER, "student-does-not-exist")
