"""Small explicit Vietnamese/English search glossary, not a translation model."""

TERMS = {
    "ai": {
        "tìm kiếm theo chiều rộng": "breadth first search",
        "tìm kiếm theo chiều sâu": "depth first search",
        "trí tuệ nhân tạo": "artificial intelligence",
        "tác tử": "agent",
        "hàm heuristic": "heuristic",
    },
    "ml": {
        "hồi quy tuyến tính": "linear regression",
        "quá khớp": "overfitting",
        "tổng quát hoá": "generalization",
        "hàm mất mát": "loss function",
        "tập huấn luyện": "training data",
    },
    "la": {
        "tích vô hướng": "dot product",
        "chuyển vị": "transpose",
        "ma trận": "matrix",
        "đạo hàm": "derivative",
        "chuẩn vector": "vector norm",
        "đại số tuyến tính": "linear algebra",
    },
    "stats": {
        "định lý bayes": "bayes theorem",
        "xác suất có điều kiện": "conditional probability",
        "xác suất": "probability",
        "độc lập": "independence",
        "kỳ vọng": "expectation",
        "phương sai": "variance",
        "biến ngẫu nhiên": "random variable",
    },
    "automation": {
        "điều khiển tự động": "automatic control",
        "phản hồi": "feedback",
        "tỉ lệ": "proportional",
        "tỷ lệ": "proportional",
        "tích phân": "integral",
        "vi phân": "derivative",
        "điểm đặt": "reference",
        "sai số": "error",
    },
}


def query_terms(query: str, course_id: str | None) -> str:
    result = query.casefold()
    if course_id in TERMS:
        # Question scaffolding has no concept meaning. Keep the original question
        # for generation, but do not dilute cross-language lexical coverage with it.
        for phrase in (
            "không làm hộ bài tập",
            "không giải hộ bài thi",
            "không viết hộ bài tập",
            "giải thích",
            "có vai trò gì",
            "thành phần",
            "gồm những thành phần nào",
            "khác nhau như thế nào",
            "được sử dụng thế nào",
            "như thế nào",
            "sử dụng",
            "là gì",
        ):
            result = result.replace(phrase, " ")
    for term, english in sorted(
        TERMS.get(course_id or "", {}).items(), key=lambda item: -len(item[0])
    ):
        result = result.replace(term, english)
    return result
