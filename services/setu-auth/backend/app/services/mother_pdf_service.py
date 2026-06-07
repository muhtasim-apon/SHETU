"""ReportLab PDF builder for Shetu Saathi maternal health reports."""
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

TEAL_DARK = colors.HexColor("#0A2E2A")
TEAL = colors.HexColor("#0E7C66")
TEAL_LIGHT = colors.HexColor("#F0FBF8")
AMBER = colors.HexColor("#F2A93B")
LIGHT_GRAY = colors.HexColor("#F1F5F4")
RISK_COLORS = {
    "low": colors.HexColor("#22C55E"),
    "watch": colors.HexColor("#F59E0B"),
    "elevated": colors.HexColor("#F97316"),
    "urgent": colors.HexColor("#EF4444"),
}
RISK_LABELS = {
    "low": "RISK: LOW — All vitals within normal range",
    "watch": "RISK: WATCH — Some borderline readings detected",
    "elevated": "RISK: ELEVATED — Consult your doctor soon",
    "urgent": "RISK: URGENT — Seek medical care immediately",
}


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("MHdrTitle", fontName="Helvetica-Bold", fontSize=18,
                            textColor=colors.white, leading=22))
    base.add(ParagraphStyle("MHdrSub", fontName="Helvetica", fontSize=10,
                            textColor=colors.white, leading=14))
    base.add(ParagraphStyle("MHdrRight", fontName="Helvetica", fontSize=9,
                            textColor=colors.white, alignment=2, leading=13))
    base.add(ParagraphStyle("MSection", fontName="Helvetica-Bold", fontSize=12,
                            textColor=TEAL, spaceBefore=10, spaceAfter=5))
    base.add(ParagraphStyle("MBody", fontName="Helvetica", fontSize=9.5,
                            leading=14, alignment=TA_LEFT))
    base.add(ParagraphStyle("MItalic", fontName="Helvetica-Oblique", fontSize=9,
                            leading=13, textColor=colors.HexColor("#475569")))
    base.add(ParagraphStyle("MSmall", fontName="Helvetica", fontSize=8,
                            leading=11, textColor=colors.HexColor("#64748B")))
    return base


def _safe(v, fmt="{}", dash="—"):
    if v is None:
        return dash
    try:
        return fmt.format(v)
    except Exception:
        return str(v)


async def generate_pregnancy_report_pdf(report_data: dict, patient_data: dict, output_path: str) -> str:
    st = _styles()
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=12 * mm, bottomMargin=14 * mm,
    )
    story = []
    page_w = A4[0] - 30 * mm

    # Header
    left = Paragraph(
        "শেতু সাতী · SHETU SAATHI<br/>"
        "<font size=10>Maternal Health Report · মাতৃস্বাস্থ্য প্রতিবেদন</font>",
        st["MHdrTitle"],
    )
    right_text = (
        f"<b>{patient_data.get('full_name', 'Patient')}</b><br/>"
        f"{patient_data.get('patient_code', '')}<br/>"
        f"Date: {datetime.now().strftime('%d %b %Y')}<br/>"
        f"Week {report_data.get('gestational_age_weeks', '?')} · {report_data.get('trimester', '').title()} Trimester<br/>"
        f"EDD: {patient_data.get('edd', '—')}<br/>"
        f"ANC Visits: {patient_data.get('anc_count', 0)}"
    )
    right = Paragraph(right_text, st["MHdrRight"])
    header = Table([[left, right]], colWidths=[page_w * 0.55, page_w * 0.45])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header)
    story.append(Spacer(1, 6))

    # Period strip
    period_text = (
        f"<font color='white'>Report Period: {report_data.get('period_start', '')} "
        f"→ {report_data.get('period_end', '')} · "
        f"Total Vitals: {report_data.get('vitals_count', 0)} · "
        f"Flagged: {report_data.get('flagged_vitals_count', 0)}</font>"
    )
    period_p = Paragraph(period_text, ParagraphStyle("period", fontName="Helvetica", fontSize=9,
                                                      alignment=1, textColor=colors.white))
    period_tbl = Table([[period_p]], colWidths=[page_w])
    period_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(period_tbl)
    story.append(Spacer(1, 6))

    # Risk band
    band = (report_data.get("overall_risk_band") or "watch").lower()
    risk_color = RISK_COLORS.get(band, RISK_COLORS["watch"])
    risk_label = RISK_LABELS.get(band, "RISK: WATCH")
    risk_p = Paragraph(f"<font color='white'><b>{risk_label}</b></font>",
                       ParagraphStyle("risk", fontName="Helvetica-Bold", fontSize=14,
                                      alignment=1, textColor=colors.white))
    risk_tbl = Table([[risk_p]], colWidths=[page_w])
    risk_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), risk_color),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(risk_tbl)

    risk_factors = report_data.get("risk_factors") or []
    if risk_factors:
        for rf in risk_factors:
            story.append(Paragraph(f"• {rf}", st["MSmall"]))
    story.append(Spacer(1, 8))

    # Vitals table
    story.append(Paragraph("Vitals Summary", st["MSection"]))
    v = report_data
    vit_header = ["Metric", "Average", "Min", "Max", "Status"]

    def _bp_status(avg):
        if avg is None:
            return "—"
        return "⚠ FLAG" if avg > 140 else "OK"

    def _val_status(val, low, high):
        if val is None:
            return "—"
        return "⚠ FLAG" if (val < low or val > high) else "OK"

    avg_sys = v.get("avg_systolic_bp")
    avg_hb = v.get("avg_hemoglobin")
    avg_gf = v.get("avg_fasting_glucose")
    avg_fhr = v.get("avg_fetal_heart_rate")

    vit_rows = [
        ["Blood Pressure",
         f"{_safe(avg_sys, '{:.0f}')}/{_safe(v.get('avg_diastolic_bp'), '{:.0f}')} mmHg",
         _safe(v.get("min_systolic_bp")), _safe(v.get("max_systolic_bp")),
         _bp_status(avg_sys)],
        ["Weight", f"{_safe(v.get('avg_weight_kg'), '{:.1f}')} kg",
         _safe(v.get("min_weight_kg")), _safe(v.get("max_weight_kg")),
         f"Δ {_safe(v.get('weight_change_kg'), '{:+.1f}')} kg"],
        ["Pulse", f"{_safe(v.get('avg_pulse_bpm'), '{:.0f}')} bpm", "—", "—",
         _val_status(v.get("avg_pulse_bpm"), 60, 110)],
        ["SpO2", f"{_safe(v.get('avg_spo2'), '{:.0f}')}%", "—", "—",
         _val_status(v.get("avg_spo2"), 95, 100)],
        ["Temperature", f"{_safe(v.get('avg_temperature_c'), '{:.1f}')}°C", "—", "—",
         _val_status(v.get("avg_temperature_c"), 36, 37.5)],
        ["Haemoglobin", f"{_safe(avg_hb, '{:.1f}')} g/dL", "—", "—",
         "⚠ FLAG" if avg_hb and avg_hb < 11 else ("OK" if avg_hb else "—")],
        ["Fasting Glucose", f"{_safe(avg_gf, '{:.0f}')} mg/dL", "—", "—",
         "⚠ FLAG" if avg_gf and avg_gf >= 92 else ("OK" if avg_gf else "—")],
        ["Urine Protein", v.get("latest_urine_protein") or "—", "—", "—",
         "⚠ FLAG" if v.get("any_proteinuria") else "OK"],
        ["Fetal Heart Rate", f"{_safe(avg_fhr, '{:.0f}')} bpm", "—", "—",
         "⚠ FLAG" if avg_fhr and (avg_fhr < 120 or avg_fhr > 160) else ("OK" if avg_fhr else "—")],
        ["Flagged Readings", str(v.get("flagged_vitals_count", 0)), "—", "—", ""],
    ]
    vtbl = Table([vit_header] + vit_rows,
                 colWidths=[page_w * x for x in (0.26, 0.26, 0.12, 0.12, 0.24)])
    vstyle = [
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i, row in enumerate(vit_rows, 1):
        if "⚠" in str(row[-1]):
            vstyle.append(("TEXTCOLOR", (-1, i), (-1, i), colors.HexColor("#EF4444")))
        if i % 2 == 0:
            vstyle.append(("BACKGROUND", (0, i), (-1, i), LIGHT_GRAY))
    vtbl.setStyle(TableStyle(vstyle))
    story.append(vtbl)
    story.append(Spacer(1, 8))

    # AI Analysis
    ai_summary = report_data.get("ai_summary")
    if ai_summary:
        story.append(Paragraph("AI Health Analysis", st["MSection"]))
        ai_p = Paragraph(ai_summary, st["MBody"])
        if report_data.get("ai_summary_bn"):
            ai_p_bn = Paragraph(f"<font color='#64748B'>{report_data['ai_summary_bn']}</font>",
                                st["MItalic"])
            ai_content = [[ai_p], [ai_p_bn]]
        else:
            ai_content = [[ai_p]]
        aibox = Table(ai_content, colWidths=[page_w])
        aibox.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, TEAL),
            ("BACKGROUND", (0, 0), (-1, -1), TEAL_LIGHT),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(aibox)

        anc_advice = report_data.get("anc_advice")
        nutrition_tip = report_data.get("nutrition_tip")
        if anc_advice or nutrition_tip:
            tip_text = ""
            if anc_advice:
                tip_text += f"<b>ANC Advice:</b> {anc_advice}<br/>"
            if nutrition_tip:
                tip_text += f"<b>Nutrition Tip:</b> {nutrition_tip}"
            tip_p = Paragraph(tip_text, st["MBody"])
            tip_box = Table([[tip_p]], colWidths=[page_w])
            tip_box.setStyle(TableStyle([
                ("BOX", (0, 0), (-1, -1), 1, AMBER),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFBEB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(Spacer(1, 4))
            story.append(tip_box)

    # Recommendations
    recs = report_data.get("ai_recommendations") or []
    if recs:
        story.append(Paragraph("Recommendations", st["MSection"]))
        for i, rec in enumerate(recs, 1):
            story.append(Paragraph(f"<font color='#0E7C66'><b>{i}.</b></font> {rec}", st["MBody"]))
        trimester_advice = report_data.get("trimester_specific_advice")
        if trimester_advice:
            story.append(Paragraph(trimester_advice, st["MItalic"]))

    # Alerts
    alerts = report_data.get("ai_alerts") or []
    if alerts:
        story.append(Spacer(1, 6))
        alert_lines = ["<b>⚠ Urgent Alerts</b>"] + [f"• {a}" for a in alerts]
        alert_p = Paragraph("<br/>".join(alert_lines),
                            ParagraphStyle("malert", fontName="Helvetica", fontSize=9.5,
                                           textColor=colors.white, leading=14))
        abox = Table([[alert_p]], colWidths=[page_w])
        abox.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 2, colors.HexColor("#EF4444")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EF4444")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(abox)

    # Footer
    story.append(Spacer(1, 12))
    footer = (
        f"Generated by Shetu Saathi AI · {datetime.now().strftime('%d %b %Y %H:%M')}<br/>"
        "For information only. Always consult a qualified doctor or midwife.<br/>"
        "<b>DANGER SIGNS → Severe headache · Bleeding · No fetal movement · Call 999 or SOS immediately.</b>"
    )
    story.append(Paragraph(footer, st["MSmall"]))

    doc.build(story)
    return os.path.abspath(output_path)
