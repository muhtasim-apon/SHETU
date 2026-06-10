"""AI analysis for maternal health reports — OpenRouter first, Gemini SDK fallback."""
import json
import logging
import re
import time
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        import google.generativeai as genai
    if settings.GEMINI_API_KEY:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    _GENAI_AVAILABLE = True
except Exception:
    _GENAI_AVAILABLE = False

_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
]

# Reliable-first, live-verified 2026-06-11. Dead/empty-output IDs removed.
_OPENROUTER_MODELS = [
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
]

_REQUIRED_KEYS = (
    "overall_risk_band", "risk_factors", "ai_summary", "ai_summary_bn",
    "ai_recommendations", "ai_alerts", "anc_advice", "nutrition_tip", "trimester_specific_advice",
)


def _build_prompt(vitals_agg: dict, pregnancy_context: dict, language: str) -> str:
    lang_word = "Bangla" if language == "bn" else "English"
    lang_directive = (
        "\nIMPORTANT: Respond ENTIRELY in Bangla (Bengali script — বাংলা). EVERY field — "
        "summaries, risk_factors, recommendations, alerts, advice and tips — MUST be written "
        "in Bengali. Do NOT use English.\n"
        if language == "bn" else ""
    )
    return f"""You are Shetu Saathi, an AI maternal health assistant for pregnant mothers in Bangladesh.
Analyze prenatal health data for a {pregnancy_context.get('trimester', 'unknown')} trimester ({pregnancy_context.get('gestational_age_weeks', '?')} weeks) pregnant mother, due {pregnancy_context.get('edd', 'unknown')}.
{lang_directive}
ANC VISITS COMPLETED: {pregnancy_context.get('anc_count', 0)} (WHO recommends 8 minimum)
VITALS SUMMARY: {json.dumps(vitals_agg, indent=2, default=str)}

Respond ONLY with valid JSON (no markdown fences) with EXACTLY these keys:
{{
  "overall_risk_band": "low|watch|elevated|urgent",
  "risk_factors": ["list of identified risks"],
  "ai_summary": "2-3 sentences in {lang_word} — warm and supportive",
  "ai_summary_bn": "same in Bangla",
  "ai_recommendations": ["3-5 actionable items"],
  "ai_alerts": ["urgent items or empty list"],
  "anc_advice": "advice based on gestational age and ANC count",
  "nutrition_tip": "one trimester-specific nutrition tip",
  "trimester_specific_advice": "tailored guidance for this trimester"
}}

Risk band: urgent=severe flag/infection/BP>160/Hb<7 | elevated=BP>140/Hb<11/GDM/proteinuria | watch=borderline | low=normal
Use WHO ANC 2016 guidelines and Bangladesh DGHS protocols. Be warm and supportive.
Respond ONLY with the JSON object."""


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    return json.loads(text)


def _normalise(result: dict) -> dict:
    for key in _REQUIRED_KEYS:
        if key not in result:
            if key in ("risk_factors", "ai_recommendations", "ai_alerts"):
                result[key] = []
            elif key == "overall_risk_band":
                result[key] = "watch"
            else:
                result[key] = ""
    return result


async def _try_openrouter(prompt: str) -> Optional[dict]:
    if not settings.OPENROUTER_API_KEY:
        return None
    for model_id in _OPENROUTER_MODELS:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "HTTP-Referer": "https://shetu.health",
                        "X-Title": "Shetu Saathi Maternal Report",
                    },
                    json={
                        "model": model_id,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 2000,
                        "response_format": {"type": "json_object"},
                    },
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    if not content or not content.strip():
                        logger.warning("OpenRouter model %s returned empty content, trying next.", model_id)
                        continue
                    result = _normalise(_parse_json(content))
                    result["generated_by_model"] = f"openrouter/{model_id}"
                    logger.info("OpenRouter model %s succeeded for maternal analysis.", model_id)
                    return result
                logger.warning(
                    "OpenRouter model %s returned %s: %s — trying next.",
                    model_id, resp.status_code, resp.text[:200],
                )
        except Exception as exc:
            logger.warning("OpenRouter model %s failed: %s", model_id, exc)
    return None


async def analyze_pregnancy_health(vitals_agg: dict, pregnancy_context: dict, language: str = 'en') -> dict:
    """OpenRouter first → Gemini SDK fallback → hardcoded fallback. Never raises."""
    prompt = _build_prompt(vitals_agg, pregnancy_context, language)
    start = time.time()

    # 1. Try OpenRouter models first
    result = await _try_openrouter(prompt)
    if result is not None:
        result["generation_latency_ms"] = int((time.time() - start) * 1000)
        return result

    # 2. Gemini SDK fallback
    if _GENAI_AVAILABLE and settings.GEMINI_API_KEY:
        for model_name in _GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(model_name)
                resp = model.generate_content(prompt)
                result = _normalise(_parse_json(resp.text))
                result["generated_by_model"] = model_name
                result["generation_latency_ms"] = int((time.time() - start) * 1000)
                logger.info("Gemini model %s succeeded for maternal analysis.", model_name)
                return result
            except Exception as exc:
                logger.warning("Gemini model %s failed: %s", model_name, exc)

    # 3. Hardcoded safe fallback — never ai_unavailable for UI
    logger.error("All AI providers failed for maternal analysis.")
    return {
        "overall_risk_band": "watch",
        "risk_factors": [],
        "ai_summary": "AI analysis is temporarily unavailable. Please review your vitals with your doctor at the next ANC visit.",
        "ai_summary_bn": "এআই বিশ্লেষণ সাময়িকভাবে অনুপলব্ধ। আপনার পরবর্তী এএনসি পরিদর্শনে ডাক্তারের সাথে আপনার ভাইটাল পর্যালোচনা করুন।",
        "ai_recommendations": [
            "Continue attending regular ANC visits as scheduled.",
            "Take prescribed iron-folic acid supplements daily.",
            "Monitor blood pressure and report any severe headache or swelling immediately.",
            "Maintain a balanced diet rich in iron, calcium and protein.",
            "Call 16767 (DGHS Maternal Helpline) for any urgent queries.",
        ],
        "ai_alerts": [],
        "anc_advice": "Continue your regular ANC schedule. WHO recommends minimum 8 visits.",
        "nutrition_tip": "Ensure adequate iron, folic acid, calcium and protein intake daily.",
        "trimester_specific_advice": "Follow your doctor's guidance for this stage of pregnancy.",
        "generated_by_model": "fallback",
        "generation_latency_ms": int((time.time() - start) * 1000),
    }
