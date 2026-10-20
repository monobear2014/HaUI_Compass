"""Conservative, deterministic boundary for explicit requests to outsource assessed work.

This is a bounded rule set, not a general intent classifier. Model instructions add
defence in depth; legitimate explanations, hints and feedback remain available.
"""

import re
import unicodedata

GUIDANCE = (
    "Mình có thể giúp bạn hiểu yêu cầu, lập dàn ý, gợi ý từng bước hoặc nhận xét phần bạn đã làm, "
    "nhưng không viết lời giải hoàn chỉnh hay đáp án để bạn nộp cho bài tính điểm. "
    "Bạn hãy gửi cách làm đang thử và bước đang vướng; mình sẽ hướng dẫn để bạn tự hoàn thành."
)


def _plain(text: str) -> str:
    return " ".join(
        "".join(
            c
            for c in unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
            if unicodedata.category(c) != "Mn"
        ).split()
    )


def requires_guidance(question: str, previous_user_questions: tuple[str, ...] = ()) -> bool:
    current = _plain(question)
    current = re.sub(
        r"(?:khong|dung|do not|don't) (?:lam ho|viet ho|giai ho|solve my|write my|do my)",
        "",
        current,
    )
    # Asking whether AI use is allowed is a policy question, not an instruction
    # to produce a submission. Keep this exception narrow and anchored to the
    # whole question; a following imperative must still hit the boundary.
    if re.fullmatch(r"co (?:the|duoc phep) (?:dung|su dung) ai [^?.!]+ khong[?.]?", current):
        return False
    assessed = _plain(" ".join((*previous_user_questions[-4:], question)))
    context = re.search(
        r"bai tap|bai thi|tinh diem|de nop|homework|assignment|exam|graded", assessed
    )
    outsourcing = re.search(
        r"lam ho|viet ho|giai ho|lam het|viet toan bo|full code|complete solution|"
        r"do my|write my|solve my|dap an (?:cuoi|de nop)|chi (?:can )?(?:gui |cho )?dap an|"
        r"just (?:the )?(?:final )?answer",
        current,
    )
    return bool(context and outsourcing)
