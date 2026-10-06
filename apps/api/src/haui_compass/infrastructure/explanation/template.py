from haui_compass.application.ports.explanation import (
    ExplanationText,
    RecommendationExplanationInput,
)
from haui_compass.domain.recommendations.recommendation import RankingDimension
from haui_compass.domain.risk.signal import RiskReasonCode

RANKING = {
    RankingDimension.RISK: "mức rủi ro của assignment quyết định thứ tự ưu tiên",
    RankingDimension.DEADLINE: "deadline sớm hơn quyết định thứ tự giữa các việc cùng mức ưu tiên",
    RankingDimension.STATUS: "ưu tiên tiếp tục việc đang làm khi rủi ro và deadline ngang nhau",
    RankingDimension.STABLE_ORDER: "các tiêu chí chính ngang nhau, nên dùng thứ tự định danh",
    RankingDimension.ONLY_CANDIDATE: "đây là task đang mở duy nhất",
}
REASONS = {
    RiskReasonCode.EFFORT_EXCEEDS_CAPACITY: "Khối lượng còn lại vượt thời gian học khả dụng.",
    RiskReasonCode.LOW_SLACK: "Phần thời gian dự phòng thấp theo quy tắc hiện tại.",
    RiskReasonCode.SUFFICIENT_SLACK: "Thời gian khả dụng có phần dự phòng theo quy tắc hiện tại.",
    RiskReasonCode.DEADLINE_PASSED: "Deadline đã qua.",
    RiskReasonCode.NO_CAPACITY_BEFORE_DEADLINE: "Không có thời gian học khả dụng trước deadline.",
    RiskReasonCode.MISSING_CAPACITY: "Chưa có dữ liệu capacity để xác định mức rủi ro.",
    RiskReasonCode.MISSING_EFFORT_ESTIMATE: "Chưa có ước lượng khối lượng còn lại.",
    RiskReasonCode.NO_REMAINING_WORK: "Không còn công việc mở.",
}


class TemplateExplanationProvider:
    async def explain(self, facts: RecommendationExplanationInput) -> ExplanationText:
        rec = facts.recommendation
        evidence = facts.risk.evidence
        pieces = [
            f"Nên làm task được đề xuất của “{facts.assignment.title}” tiếp theo: "
            f"{RANKING[rec.evidence.deciding_dimension]}.",
            f"Rủi ro assignment là {facts.risk.level.value.upper()}; "
            f"ước lượng của task là {rec.evidence.estimated_duration.total_seconds() / 60:g} phút.",
        ]
        if evidence.remaining_effort is not None:
            pieces.append(
                f"Assignment còn {evidence.remaining_effort.total_seconds() / 60:g} phút công việc."
            )
        if evidence.available_capacity is not None:
            pieces.append(
                f"Thời gian học khả dụng trước deadline là "
                f"{evidence.available_capacity.total_seconds() / 60:g} phút "
                "(capacity của từng assignment, không phải phần thời gian đã được dành riêng)."
            )
        pieces.extend(REASONS[code] for code in facts.risk.reason_codes)
        return ExplanationText(" ".join(pieces))
