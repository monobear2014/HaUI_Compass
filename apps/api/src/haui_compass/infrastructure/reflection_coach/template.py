"""Offline Vietnamese weekly-reflection support; always available as the fallback."""

from haui_compass.application.ports.reflection_coach import CoachText, ReflectionCoachInput

STRENGTHS = {
    "completed_tasks": "bạn đã hoàn thành được việc trong tuần",
    "deadlines_met": "các deadline đến hạn đều đã xong",
    "consistent_sessions": "bạn học đều đặn qua nhiều ngày",
    "accurate_estimates": "ước lượng thời gian của bạn khá sát thực tế",
}
QUESTIONS = {
    "missed_sessions": "Điều gì khiến bạn chưa bắt đầu {missed}? Lần tới bạn có thể chia nhỏ "
    "bước đầu tiên như thế nào?",
    "deadline_missed": "Với {deadline}, dấu hiệu nào lẽ ra giúp bạn nhận ra rủi ro sớm hơn?",
    "underestimated": "Phần nào mất nhiều thời gian hơn dự kiến? Tuần sau bạn muốn cộng thêm "
    "bao nhiêu thời gian dự phòng?",
    "low_follow_through": "Khung giờ nào trong kế hoạch khó giữ nhất? Bạn muốn đổi sang khung "
    "nào thực tế hơn?",
    "no_activity": "Tuần này điều gì cản trở bạn bắt đầu? Một việc nhỏ 25 phút nào bạn có "
    "thể làm ngay đầu tuần sau?",
}


class TemplateReflectionCoachProvider:
    async def coach(self, facts: ReflectionCoachInput) -> CoachText:
        parts = [
            f"Tuần này bạn đã học {facts.actual_minutes} phút so với {facts.planned_minutes} "
            f"phút trong kế hoạch, hoàn thành {len(facts.completed_tasks)} việc và còn "
            f"{len(facts.open_tasks)} việc mở."
        ]
        strengths = [STRENGTHS[code] for code in facts.strengths if code in STRENGTHS]
        if strengths:
            parts.append("Điểm tốt: " + "; ".join(strengths) + ".")
        if facts.deadlines_upcoming:
            parts.append("Sắp tới cần chú ý: " + ", ".join(facts.deadlines_upcoming[:3]) + ".")
        questions = [
            QUESTIONS[code].format(
                missed=", ".join(facts.missed_tasks[:2]) or "việc đã lên lịch",
                deadline=", ".join(facts.deadlines_missed[:2]) or "bài bị trễ",
            )
            for code in facts.weaknesses
            if code in QUESTIONS
        ]
        if not questions:
            questions.append(
                "Điều gì đã giúp tuần này suôn sẻ, và bạn muốn giữ lại thói quen nào cho tuần sau?"
            )
        questions.append("Mục tiêu quan trọng nhất của bạn cho tuần sau là gì?")
        return CoachText(summary=" ".join(parts), questions=tuple(questions[:3]))
