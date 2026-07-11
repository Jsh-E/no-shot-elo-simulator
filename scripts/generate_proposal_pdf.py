"""Render docs/elo-system-proposal.md into a polished PDF.

Usage: python scripts/generate_proposal_pdf.py <input_md> <output_pdf>
"""

import re
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ACCENT = colors.HexColor("#1f3a5f")
LIGHT_ROW = colors.HexColor("#eef2f7")
CODE_BG = colors.HexColor("#f4f4f4")
TEXT = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#555555")

pdfmetrics.registerFont(TTFont("Body", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Body-Italic", r"C:\Windows\Fonts\ariali.ttf"))
pdfmetrics.registerFont(TTFont("Body-BoldItalic", r"C:\Windows\Fonts\arialbi.ttf"))
pdfmetrics.registerFont(TTFont("Mono", r"C:\Windows\Fonts\consola.ttf"))
pdfmetrics.registerFontFamily(
    "Body",
    normal="Body",
    bold="Body-Bold",
    italic="Body-Italic",
    boldItalic="Body-BoldItalic",
)

STYLES = {
    "title": ParagraphStyle(
        "title", fontName="Body-Bold", fontSize=24, leading=29,
        textColor=ACCENT, spaceAfter=10,
    ),
    "subtitle": ParagraphStyle(
        "subtitle", fontName="Body-Bold", fontSize=12.5, leading=16,
        textColor=TEXT, spaceAfter=6,
    ),
    "meta": ParagraphStyle(
        "meta", fontName="Body-Italic", fontSize=9.5, leading=13,
        textColor=MUTED, spaceAfter=14,
    ),
    "h1": ParagraphStyle(
        "h1", fontName="Body-Bold", fontSize=16, leading=20,
        textColor=ACCENT, spaceBefore=18, spaceAfter=8,
    ),
    "h2": ParagraphStyle(
        "h2", fontName="Body-Bold", fontSize=12.5, leading=16,
        textColor=TEXT, spaceBefore=12, spaceAfter=5,
    ),
    "body": ParagraphStyle(
        "body", fontName="Body", fontSize=10, leading=14.5,
        textColor=TEXT, spaceAfter=7,
    ),
    "bullet": ParagraphStyle(
        "bullet", fontName="Body", fontSize=10, leading=14.5,
        textColor=TEXT, spaceAfter=4, leftIndent=16, bulletIndent=4,
    ),
    "code": ParagraphStyle(
        "code", fontName="Mono", fontSize=9, leading=12.5, textColor=TEXT,
    ),
    "cell": ParagraphStyle(
        "cell", fontName="Body", fontSize=9, leading=12, textColor=TEXT,
    ),
    "cellhead": ParagraphStyle(
        "cellhead", fontName="Body-Bold", fontSize=9, leading=12,
        textColor=colors.white,
    ),
}


def inline(text):
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Mono" size="9">\1</font>', text)
    return text


def build_table(rows, doc_width):
    header, body = rows[0], rows[1:]

    data = [[Paragraph(inline(cell), STYLES["cellhead"]) for cell in header]]
    for row in body:
        data.append([Paragraph(inline(cell), STYLES["cell"]) for cell in row])

    cols = len(header)
    weights = [
        max(len(rows[r][c]) for r in range(len(rows))) for c in range(cols)
    ]
    weights = [min(max(w, 12), 60) for w in weights]
    total = sum(weights)
    widths = [doc_width * w / total for w in weights]

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9d2dd")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), LIGHT_ROW))

    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle(style))
    return table


def build_code_block(lines, doc_width):
    pre = Preformatted("\n".join(lines), STYLES["code"])
    box = Table([[pre]], colWidths=[doc_width])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d8d8d8")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return box


def parse(md_text, doc_width):
    story = []
    lines = md_text.splitlines()
    i = 0
    seen_title = False
    seen_subtitle = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            story.append(Spacer(1, 4))
            story.append(build_code_block(code_lines, doc_width))
            story.append(Spacer(1, 8))
            i += 1
            continue

        if stripped.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                story.append(Spacer(1, 4))
                story.append(build_table(rows, doc_width))
                story.append(Spacer(1, 10))
            continue

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            story.append(Spacer(1, 6))
            story.append(HRFlowable(width="100%", thickness=0.7, color=ACCENT))
            story.append(Spacer(1, 6))
        elif stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:]), STYLES["h2"]))
        elif stripped.startswith("## "):
            story.append(Paragraph(inline(stripped[3:]), STYLES["h1"]))
        elif stripped.startswith("# "):
            story.append(Paragraph(inline(stripped[2:]), STYLES["title"]))
            seen_title = True
        elif stripped.startswith("- "):
            story.append(Paragraph(inline(stripped[2:]), STYLES["bullet"], bulletText="•"))
        elif re.match(r"^\d+\.\s", stripped):
            number, rest = stripped.split(". ", 1)
            story.append(Paragraph(inline(rest), STYLES["bullet"], bulletText=f"{number}."))
        elif seen_title and not seen_subtitle and stripped.startswith("**") and stripped.endswith("**"):
            story.append(Paragraph(inline(stripped.strip("*")), STYLES["subtitle"]))
            seen_subtitle = True
        elif seen_title and stripped.startswith("*") and stripped.endswith("*") and not stripped.startswith("**"):
            story.append(Paragraph(inline(stripped.strip("*")), STYLES["meta"]))
        else:
            story.append(Paragraph(inline(stripped), STYLES["body"]))

        i += 1

    return story


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Body", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.85 * inch, 0.55 * inch, "No Shot — Ranked System Proposal")
    canvas.drawRightString(letter[0] - 0.85 * inch, 0.55 * inch, f"Page {doc.page}")
    canvas.restoreState()


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: generate_proposal_pdf.py <input_md> <output_pdf>")

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        md_text = f.read()

    doc = SimpleDocTemplate(
        sys.argv[2],
        pagesize=letter,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.85 * inch,
        title="A Healthier Rating System for No Shot",
        author="No Shot community",
    )

    story = parse(md_text, doc.width)
    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    print(f"Wrote {sys.argv[2]}")


if __name__ == "__main__":
    main()
