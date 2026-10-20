"""Study abbreviations expanded before retrieval so 'ML' can match 'machine learning'.

Terms that course materials already write literally (AI, MAE, RMSE, SQL) are left out:
expanding them dilutes lexical retrieval.
"""

import re

ABBREVIATIONS = {
    "ml": "machine learning học máy",
    "dl": "deep learning học sâu",
    "nlp": "natural language processing xử lý ngôn ngữ tự nhiên",
    "cv": "computer vision thị giác máy tính",
    "nn": "neural network mạng nơ-ron",
    "ann": "artificial neural network mạng nơ-ron nhân tạo",
    "cnn": "convolutional neural network mạng nơ-ron tích chập",
    "rnn": "recurrent neural network mạng nơ-ron hồi quy",
    "lstm": "long short-term memory",
    "llm": "large language model mô hình ngôn ngữ lớn",
    "rl": "reinforcement learning học tăng cường",
    "svm": "support vector machine",
    "knn": "k-nearest neighbors k láng giềng gần nhất",
    "pca": "principal component analysis phân tích thành phần chính",
    "gd": "gradient descent",
    "sgd": "stochastic gradient descent",
    "bfs": "breadth first search tìm kiếm theo chiều rộng",
    "dfs": "depth first search tìm kiếm theo chiều sâu",
    "csdl": "cơ sở dữ liệu database",
    "oop": "object oriented programming lập trình hướng đối tượng",
    "ctdl": "cấu trúc dữ liệu data structure",
    "pid": "proportional integral derivative",
    "xstk": "xác suất thống kê probability statistics",
    "đstt": "đại số tuyến tính linear algebra",
}

_PATTERN = re.compile(
    r"(?<![\w-])(" + "|".join(map(re.escape, ABBREVIATIONS)) + r")(?![\w-])", re.I
)


def english_expansion(abbreviation: str) -> str:
    words = ABBREVIATIONS[abbreviation.casefold()].split()
    return " ".join(w for w in words if w.isascii()).strip()


def expand_abbreviations(text: str) -> str:
    """'ML là gì' -> 'ML machine learning là gì'; the abbreviation itself is kept."""

    def expand(match: re.Match[str]) -> str:
        english = english_expansion(match.group(0))
        return f"{match.group(0)} {english}" if english else match.group(0)

    return _PATTERN.sub(expand, text)


def abbreviation_notes(text: str) -> tuple[str, ...]:
    found = dict.fromkeys(m.group(0).casefold() for m in _PATTERN.finditer(text))
    return tuple(f"{key.upper()} = {ABBREVIATIONS[key]}" for key in found)
