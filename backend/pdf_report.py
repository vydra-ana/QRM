from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from database import REPORTS_DIR


def generate_audit_pdf(
    audit_id: str,
    inspector_name: str,
    department_name: str,
    shift: str,
    score: float,
    status: str,
    conclusion: str | None,
    notes: str | None,
    answers: list[dict],
    photo_paths: list[Path],
) -> Path:
    pdf_path = REPORTS_DIR / f"report_{audit_id}.pdf"
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=12,
        textColor=colors.HexColor("#1a1a1a"),
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontSize=12,
        spaceBefore=12,
        spaceAfter=6,
    )
    body = styles["Normal"]

    status_cs = {"passed": "SCHVÁLENO", "failed": "NEVYHOVUJE", "pending": "ČEKÁ"}.get(
        status, status.upper()
    )

    story = [
        Paragraph("QRM — Zpráva inspektora", title_style),
        Paragraph(f"Datum: {datetime.utcnow().strftime('%d.%m.%Y %H:%M')}", body),
        Spacer(1, 0.4 * cm),
        Paragraph(f"<b>Inspektor:</b> {inspector_name}", body),
        Paragraph(f"<b>Oddělení:</b> {department_name}", body),
        Paragraph(f"<b>Směna:</b> {shift}", body),
        Paragraph(f"<b>Hodnocení:</b> {score:.0f}% — {status_cs}", body),
    ]

    if conclusion:
        story += [
            Spacer(1, 0.3 * cm),
            Paragraph("Závěr inspektora", heading_style),
            Paragraph(conclusion.replace("\n", "<br/>"), body),
        ]

    if notes:
        story += [
            Spacer(1, 0.3 * cm),
            Paragraph("Poznámky k auditu", heading_style),
            Paragraph(notes.replace("\n", "<br/>"), body),
        ]

    if answers:
        story += [Spacer(1, 0.3 * cm), Paragraph("Kontrolní body", heading_style)]
        table_data = [["Kód", "Hodnocení", "Poznámka"]]
        value_map = {"pass": "OK", "fail": "CHYBA", "na": "N/A"}
        for a in answers:
            table_data.append([
                a.get("code", "—"),
                value_map.get(a.get("value", ""), a.get("value", "")),
                (a.get("notes") or "—")[:80],
            ])
        table = Table(table_data, colWidths=[3 * cm, 3 * cm, 10 * cm])
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FFC700")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ])
        )
        story.append(table)

    if photo_paths:
        story += [Spacer(1, 0.5 * cm), Paragraph("Fotodokumentace", heading_style)]
        for photo in photo_paths[:10]:
            if photo.exists() and photo.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                try:
                    img = Image(str(photo), width=14 * cm, height=8 * cm, kind="proportional")
                    story += [img, Spacer(1, 0.2 * cm)]
                except Exception:
                    story.append(Paragraph(f"[Foto: {photo.name}]", body))

    doc.build(story)
    return pdf_path
