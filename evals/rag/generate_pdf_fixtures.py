"""Reproducible fictional PDF fixtures. Run with uv run --with reportlab --with pypdf."""

from pathlib import Path

from pypdf import PdfWriter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent / "fixtures"


def generate() -> None:
    document = canvas.Canvas(str(ROOT / "ml-pages.pdf"), invariant=1, pagesize=(595, 842))
    pages = [
        (
            "Softmax",
            [
                "[SOURCE:pdf-softmax]",
                "Softmax converts logits into a probability distribution.",
                "The output probabilities sum to one.",
                "Temperature scaling divides logits by a positive temperature.",
                "A larger temperature produces a flatter distribution.",
            ],
        ),
        (
            "Gradient descent",
            [
                "[SOURCE:pdf-gradient]",
                "Gradient descent updates parameters opposite to the gradient.",
                "The learning rate controls the size of each update step.",
                "A very large learning rate can cause divergence.",
            ],
        ),
        (
            "Retrieval evaluation",
            [
                "[SOURCE:pdf-retrieval]",
                "Hit@3 checks whether at least one expected source is in the top three.",
                "MRR is the mean reciprocal rank of the first relevant source.",
                "Source recall measures the fraction of expected sources retrieved.",
            ],
        ),
    ]
    for number, (title, lines) in enumerate(pages, 1):
        document.setFont("Helvetica-Bold", 20)
        document.drawString(50, 780, title)
        document.setFont("Helvetica", 11)
        for index, line in enumerate(lines):
            document.drawString(50, 730 - index * 25, line)
        document.setFont("Helvetica", 9)
        document.drawString(50, 40, f"Fictional HaUI Compass evaluation fixture - Page {number}")
        document.showPage()
    document.save()
    # No text operators: a representative image/graphics-only PDF, without OCR.
    scanned = canvas.Canvas(str(ROOT / "image-only.pdf"), invariant=1)
    scanned.setFillColorRGB(0.2, 0.4, 0.6)
    scanned.rect(60, 200, 400, 400, fill=1)
    scanned.showPage()
    scanned.save()
    writer = PdfWriter()
    with (ROOT / "empty.pdf").open("wb") as stream:
        writer.write(stream)


if __name__ == "__main__":
    generate()
