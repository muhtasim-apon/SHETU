from app.services.flag_service import FlagDetail


def detect_maternal_flags(vitals: dict) -> list[FlagDetail]:
    flags = []
    sys, dia = vitals.get("systolic_bp"), vitals.get("diastolic_bp")
    if sys and dia:
        if sys > 160 or dia > 110:
            flags.append(FlagDetail(type="high_bp", severity="severe",
                message="Severely elevated BP — DANGER SIGN. Risk of pre-eclampsia. Use SOS immediately.",
                value=sys, normal_range="<140/90 mmHg in pregnancy"))
        elif sys > 140 or dia > 90:
            flags.append(FlagDetail(type="high_bp", severity="elevated",
                message="BP elevated. Check for pre-eclampsia signs (protein in urine, headache).",
                value=sys, normal_range="<140/90 mmHg"))
        elif sys < 90 or dia < 60:
            flags.append(FlagDetail(type="low_bp", severity="moderate",
                message="Low BP. Rest on your left side and drink fluids.",
                value=sys, normal_range="90-140/60-90 mmHg"))

    spo2 = vitals.get("oxygen_saturation")
    if spo2:
        if spo2 < 90:
            flags.append(FlagDetail(type="critical_low_spo2", severity="severe",
                message="Critically low oxygen — DANGER SIGN. Seek emergency care immediately.",
                value=spo2, normal_range="95-100%"))
        elif spo2 < 95:
            flags.append(FlagDetail(type="low_spo2", severity="moderate",
                message="Oxygen saturation low. Rest and seek care if it persists.",
                value=spo2, normal_range="95-100%"))

    up = vitals.get("urine_protein")
    if up in ("2+", "3+", "4+"):
        flags.append(FlagDetail(type="high_protein_urine", severity="severe",
            message=f"Significant protein in urine ({up}) — possible pre-eclampsia. Urgent care needed.",
            normal_range="none or trace"))
    elif up == "1+":
        flags.append(FlagDetail(type="protein_urine", severity="moderate",
            message="Protein in urine (1+). Monitor and report to doctor.",
            normal_range="none or trace"))

    if vitals.get("urine_glucose_positive"):
        flags.append(FlagDetail(type="glucose_urine", severity="moderate",
            message="Glucose in urine. May indicate gestational diabetes. Consult doctor.",
            normal_range="no glucose"))

    hb = vitals.get("hemoglobin")
    if hb:
        if hb < 7:
            flags.append(FlagDetail(type="severe_anaemia", severity="severe",
                message="Severe anaemia (Hb<7) — DANGER SIGN. Seek medical care immediately.",
                value=hb, normal_range="≥11 g/dL"))
        elif hb < 11:
            flags.append(FlagDetail(type="anaemia", severity="moderate",
                message=f"Anaemia (Hb {hb} g/dL). Ensure iron-folic supplementation.",
                value=hb, normal_range="≥11 g/dL"))

    gf = vitals.get("blood_glucose_fasting")
    if gf:
        if gf >= 126:
            flags.append(FlagDetail(type="high_fasting_glucose", severity="severe",
                message=f"Fasting glucose critically high ({gf} mg/dL). Seek doctor immediately.",
                value=gf, normal_range="<92 mg/dL"))
        elif gf >= 92:
            flags.append(FlagDetail(type="elevated_fasting_glucose", severity="elevated",
                message=f"Fasting glucose elevated ({gf} mg/dL). GDM risk.",
                value=gf, normal_range="<92 mg/dL"))

    g1 = vitals.get("blood_glucose_1hr")
    if g1 and g1 >= 180:
        flags.append(FlagDetail(type="high_1hr_glucose", severity="elevated",
            message=f"1-hr OGTT glucose high ({g1} mg/dL). Possible GDM.",
            value=g1, normal_range="<180 mg/dL"))

    g2 = vitals.get("blood_glucose_2hr")
    if g2 and g2 >= 153:
        flags.append(FlagDetail(type="high_2hr_glucose", severity="elevated",
            message=f"2-hr OGTT glucose high ({g2} mg/dL). Possible GDM.",
            value=g2, normal_range="<153 mg/dL"))

    fhr = vitals.get("fetal_heart_rate")
    if fhr:
        if fhr < 100 or fhr > 180:
            flags.append(FlagDetail(type="abnormal_fhr", severity="severe",
                message=f"Fetal HR {fhr} bpm — DANGER SIGN. Seek medical care immediately.",
                value=fhr, normal_range="120-160 bpm"))
        elif fhr < 120 or fhr > 160:
            flags.append(FlagDetail(type="borderline_fhr", severity="moderate",
                message=f"Fetal HR {fhr} bpm outside normal range. Inform doctor.",
                value=fhr, normal_range="120-160 bpm"))

    temp = vitals.get("temperature_c")
    if temp:
        if temp >= 39:
            flags.append(FlagDetail(type="high_fever", severity="severe",
                message="High fever in pregnancy — DANGER SIGN. Seek care immediately.",
                value=temp, normal_range="36-37.5°C"))
        elif temp >= 38:
            flags.append(FlagDetail(type="fever", severity="moderate",
                message="Fever detected. Consult doctor — fever in pregnancy needs attention.",
                value=temp, normal_range="36-37.5°C"))

    pulse = vitals.get("pulse_bpm")
    if pulse:
        if pulse > 110:
            flags.append(FlagDetail(type="tachycardia", severity="moderate",
                message="Heart rate elevated. Rest and consult doctor.",
                value=pulse, normal_range="60-100 bpm"))
        elif pulse < 50:
            flags.append(FlagDetail(type="bradycardia", severity="moderate",
                message="Low pulse rate. Seek medical advice.",
                value=pulse, normal_range="60-100 bpm"))

    if vitals.get("hep_b_surface_antigen"):
        flags.append(FlagDetail(type="hep_b_positive", severity="severe",
            message="Hepatitis B positive. URGENT — inform doctor to prevent mother-to-child transmission.",
            normal_range="negative"))
    if vitals.get("hiv_positive"):
        flags.append(FlagDetail(type="hiv_positive", severity="severe",
            message="HIV positive. URGENT — PMTCT therapy must start immediately.",
            normal_range="negative"))
    if vitals.get("vdrl_positive"):
        flags.append(FlagDetail(type="syphilis_positive", severity="severe",
            message="Syphilis (VDRL) positive. URGENT — antibiotic treatment needed immediately.",
            normal_range="negative"))

    return flags


def worst_severity(flags: list[FlagDetail]) -> str:
    order = {"mild": 1, "elevated": 2, "moderate": 2, "severe": 3}
    return max(flags, key=lambda f: order.get(f.severity, 0)).severity if flags else ""
