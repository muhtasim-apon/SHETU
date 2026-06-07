"""ReportLab PDF builder for the Shetu Saathi patient health report."""
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

TEAL = colors.HexColor("#0E7C66")
LIGHT_GRAY = colors.HexColor("#F1F5F4")
RISK_COLORS = {
    "low": colors.HexColor("#22C55E"),
    "watch": colors.HexColor("#F59E0B"),
    "elevated": colors.HexColor("#F97316"),
    "urgent": colors.HexColor("#EF4444"),
}
RISK_LABELS = {
    "low": "RISK: LOW",
    "watch": "RISK: WATCH",
    "elevated": "RISK: ELEVATED",
    "urgent": "RISK: URGENT — CONSULT DOCTOR IMMEDIATELY",
}


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("HdrTitle", fontName="Helvetica-Bold", fontSize=20,
                            textColor=colors.white, leading=24))
    base.add(ParagraphStyle("HdrSub", fontName="Helvetica", fontSize=11,
                            textColor=colors.white, leading=14))
    base.add(ParagraphStyle("HdrRight", fontName="Helvetica", fontSize=9,
                            textColor=colors.white, alignment=2, leading=13))
    base.add(ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=13,
                            textColor=TEAL, spaceBefore=12, spaceAfter=6))
    base.add(ParagraphStyle("Body2", fontName="Helvetica", fontSize=9.5,
                            leading=14, alignment=TA_LEFT))
    base.add(ParagraphStyle("Italic2", fontName="Helvetica-Oblique", fontSize=9,
                            leading=13, textColor=colors.HexColor("#475569")))
    base.add(ParagraphStyle("Small2", fontName="Helvetica", fontSize=8,
                            leading=11, textColor=colors.HexColor("#64748B")))
    return base


def _safe(v, fmt="{}", dash="—"):
    if v is None:
        return dash
    try:
        return fmt.format(v)
    except Exception:  # noqa: BLE001
        return str(v)


async def generate_patient_report_pdf(
    report_data: dict,
    patient_data: dict,
    output_path: str,
) -> str:
    """Build a styled A4 PDF and return its absolute path."""
    st = _styles()
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=12 * mm, bottomMargin=14 * mm,
    )
    story = []
    page_w = A4[0] - 30 * mm

    # ── Header band ─────────────────────────────────────────────────────────
    left = Paragraph(
        "SHETU SAATHI<br/><font size=11>শেতু সাতী স্বাস্থ্য প্রতিবেদন</font>",
        st["HdrTitle"],
    )
    right_text = (
        f"<b>{patient_data.get('full_name', 'Patient')}</b><br/>"
        f"{patient_data.get('patient_code', '')}<br/>"
        f"Report Date: {datetime.now().strftime('%d %b %Y')}<br/>"
        f"Period: {report_data.get('period_start', '')} to {report_data.get('period_end', '')}"
    )
    right = Paragraph(right_text, st["HdrRight"])
    header = Table([[left, right]], colWidths=[page_w * 0.5, page_w * 0.5])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header)
    story.append(Spacer(1, 6))

    # ── Risk band bar ─────────────────────────────────────────────────────────
    band = (report_data.get("overall_risk_band") or "low").lower()
    risk_color = RISK_COLORS.get(band, RISK_COLORS["low"])
    risk_label = RISK_LABELS.get(band, "RISK: LOW")
    risk_p = Paragraph(
        f"<font color='white'><b>{risk_label}</b></font>",
        ParagraphStyle("risk", fontName="Helvetica-Bold", fontSize=16,
                       alignment=1, textColor=colors.white),
    )
    risk_tbl = Table([[risk_p]], colWidths=[page_w])
    risk_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), risk_color),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(risk_tbl)
    story.append(Spacer(1, 8))

    # ── Patient profile box ───────────────────────────────────────────────────
    chronic = ", ".join(patient_data.get("chronic_conditions", [])) or "None reported"
    profile_rows = [
        [f"BMI: {_safe(patient_data.get('bmi'), '{:.1f}')}",
         f"Blood Group: {_safe(patient_data.get('blood_group'))}",
         f"Activity: {_safe(patient_data.get('activity_level'))}"],
        [f"Smoker: {'Yes' if patient_data.get('is_smoker') else 'No'}",
         f"Diabetic: {'Yes' if patient_data.get('is_diabetic') else 'No'}",
         f"Hypertensive: {'Yes' if patient_data.get('is_hypertensive') else 'No'}"],
    ]
    pbox = Table(profile_rows, colWidths=[page_w / 3] * 3)
    pbox.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(pbox)
    story.append(Paragraph(f"<b>Chronic conditions:</b> {chronic}", st["Small2"]))
    story.append(Spacer(1, 6))

    # ── Vitals summary table ──────────────────────────────────────────────────
    story.append(Paragraph("Vitals Summary", st["Section"]))
    v = report_data
    bp_status = "OK" if (v.get("avg_systolic_bp") or 0) < 130 else "FLAG"
    spo2_status = "OK" if (v.get("avg_spo2_stream") or v.get("avg_spo2") or 100) >= 95 else "FLAG"
    vit_header = ["Metric", "Readings", "Average", "Min", "Max", "Status"]
    vit_rows = [
        ["Blood Pressure", _safe(v.get("vitals_count")),
         f"{_safe(v.get('avg_systolic_bp'), '{:.0f}')}/{_safe(v.get('avg_diastolic_bp'), '{:.0f}')} mmHg",
         _safe(v.get("min_systolic_bp")), _safe(v.get("max_systolic_bp")),
         "OK" if bp_status == "OK" else "FLAG"],
        ["SpO2", _safe(v.get("vitals_count")),
         f"{_safe(v.get('avg_spo2'), '{:.0f}')}%", "—", "—",
         "OK" if spo2_status == "OK" else "FLAG"],
        ["Pulse Rate", _safe(v.get("vitals_count")),
         f"{_safe(v.get('avg_pulse_bpm'), '{:.0f}')} bpm",
         _safe(v.get("min_pulse_bpm")), _safe(v.get("max_pulse_bpm")), "OK"],
        ["Temperature", _safe(v.get("vitals_count")),
         f"{_safe(v.get('avg_temperature_c'), '{:.1f}')}°C", "—", "—", "OK"],
        ["Weight", _safe(v.get("vitals_count")),
         f"{_safe(v.get('avg_weight_kg'), '{:.1f}')} kg", "—", "—",
         f"change: {_safe(v.get('weight_change_kg'), '{:+.1f}')} kg"],
    ]
    vtbl = Table([vit_header] + vit_rows, colWidths=[page_w * x for x in
                 (0.24, 0.13, 0.25, 0.1, 0.1, 0.18)])
    vstyle = [
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(vit_rows) + 1):
        if i % 2 == 0:
            vstyle.append(("BACKGROUND", (0, i), (-1, i), LIGHT_GRAY))
    vtbl.setStyle(TableStyle(vstyle))
    story.append(vtbl)

    # ── Daily wellness summary ─────────────────────────────────────────────────
    story.append(Paragraph("Daily Wellness Summary", st["Section"]))
    sd = v.get("symptom_days", {})
    wellness = (
        f"Avg Energy: {_safe(v.get('avg_energy_level'), '{:.1f}')}/10 &nbsp;|&nbsp; "
        f"Avg Sleep: {_safe(v.get('avg_sleep_hours'), '{:.1f}')}h &nbsp;|&nbsp; "
        f"Total Steps: {_safe(v.get('total_steps'))}<br/>"
        f"Avg Pain: {_safe(v.get('avg_pain_level'), '{:.1f}')}/10 &nbsp;|&nbsp; "
        f"Exercise: {_safe(v.get('total_exercise_minutes'))} min &nbsp;|&nbsp; "
        f"Check-ins: {_safe(v.get('checkins_count'))}<br/>"
        f"Symptom days — Headache: {sd.get('headache', 0)}d &nbsp;|&nbsp; "
        f"Fever: {sd.get('fever', 0)}d &nbsp;|&nbsp; Chest Pain: {sd.get('chest_pain', 0)}d"
    )
    story.append(Paragraph(wellness, st["Body2"]))

    # ── Health goals progress ──────────────────────────────────────────────────
    goals = report_data.get("goals", [])
    if goals:
        story.append(Paragraph("Health Goals Progress", st["Section"]))
        for g in goals:
            pct = min(100, max(0, g.get("progress_percent", 0) or 0))
            bar = Table([[""]], colWidths=[page_w * pct / 100 or 1], rowHeights=[7])
            bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TEAL)]))
            story.append(Paragraph(
                f"<b>{g.get('goal_label', 'Goal')}</b> — "
                f"{_safe(g.get('current_value'))}/{_safe(g.get('target_value'))} "
                f"{g.get('target_unit', '')} ({pct:.0f}%)", st["Small2"]))
            story.append(bar)
            story.append(Spacer(1, 3))

    # ── AI analysis box ─────────────────────────────────────────────────────────
    ai_summary = report_data.get("ai_summary")
    if ai_summary:
        story.append(Paragraph("AI Health Analysis", st["Section"]))
        ai_text = ai_summary
        if report_data.get("bp_interpretation"):
            ai_text += f"<br/><br/><b>BP:</b> {report_data['bp_interpretation']}"
        if report_data.get("spo2_interpretation"):
            ai_text += f"<br/><b>SpO2:</b> {report_data['spo2_interpretation']}"
        ai_p = Paragraph(ai_text, st["Body2"])
        aibox = Table([[ai_p]], colWidths=[page_w])
        aibox.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, TEAL),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FBF8")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(aibox)
        if report_data.get("lifestyle_advice"):
            story.append(Paragraph(report_data["lifestyle_advice"], st["Italic2"]))
    elif report_data.get("ai_unavailable"):
        story.append(Paragraph("AI Health Analysis", st["Section"]))
        story.append(Paragraph("AI analysis is temporarily unavailable.", st["Italic2"]))

    # ── Recommendations ─────────────────────────────────────────────────────────
    recs = report_data.get("ai_recommendations") or []
    if recs:
        story.append(Paragraph("Recommendations", st["Section"]))
        if report_data.get("goal_feedback"):
            story.append(Paragraph(report_data["goal_feedback"], st["Italic2"]))
        for i, rec in enumerate(recs, 1):
            story.append(Paragraph(f"<font color='#0E7C66'><b>{i}.</b></font> {rec}", st["Body2"]))

    # ── Alerts ──────────────────────────────────────────────────────────────────
    alerts = report_data.get("ai_alerts") or []
    if alerts:
        story.append(Spacer(1, 6))
        alert_inner = ["<b>⚠ Attention Required</b>"] + [f"• {a}" for a in alerts]
        alert_p = Paragraph("<br/>".join(alert_inner),
                            ParagraphStyle("alert", fontName="Helvetica", fontSize=9.5,
                                           textColor=colors.white, leading=14))
        abox = Table([[alert_p]], colWidths=[page_w])
        abox.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EF4444")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(abox)

    # ── Flag details ────────────────────────────────────────────────────────────
    flags_breakdown = report_data.get("flags_breakdown") or {}
    if (report_data.get("flagged_vitals_count") or 0) > 0 and flags_breakdown:
        story.append(Paragraph("Flag Details", st["Section"]))
        frows = [["Flag Type", "Count"]]
        for ftype, count in flags_breakdown.items():
            frows.append([str(ftype), str(count)])
        ftbl = Table(frows, colWidths=[page_w * 0.7, page_w * 0.3])
        ftbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EF4444")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ]))
        story.append(ftbl)

    # ── Footer ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    footer = (
        f"Generated by Shetu Saathi AI · {datetime.now().strftime('%d %b %Y %H:%M')}<br/>"
        "For information only. Always consult a qualified doctor.<br/>"
        "Emergency: 999 | Health Helpline: 16767 | Ambulance: 199"
    )
    story.append(Paragraph(footer, st["Small2"]))

    doc.build(story)
    return os.path.abspath(output_path)
