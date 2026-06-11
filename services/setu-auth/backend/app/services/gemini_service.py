"""AI analysis for patient health reports — OpenRouter chain primary, Gemini fallback, local Ollama final fallback."""
import json
import logging
import re
import time
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import google.generativeai as genai
    if settings.GEMINI_API_KEY:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    _GENAI_AVAILABLE = True
except Exception:  # noqa: BLE001
    _GENAI_AVAILABLE = False

# Gemini SDK models — exact names from genai.list_models()
_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
]

# OpenRouter free models — reliable-first (live-verified 2026-06-11).
# Removed dead IDs (z-ai/glm-4.5-air, moonshotai/kimi-k2.6 -> 404 not-free) and
# the nano-omni reasoning model (emits empty content). gemma/llama kept as
# lower-priority fallbacks since they intermittently 429.
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
    "ai_recommendations", "ai_alerts", "lifestyle_advice", "goal_feedback",
    "bp_interpretation", "spo2_interpretation",
)


def _build_prompt(vitals_data, checkin_data, goals_data, patient_context, language) -> str:
    lang_word = "Bangla" if language == "bn" else "English"
    lang_directive = (
        "\nIMPORTANT: Respond ENTIRELY in Bangla (Bengali script — বাংলা). EVERY field "
        "below — summaries, risk_factors, recommendations, alerts, advice, feedback and "
        "all interpretations — MUST be written in Bengali. Do NOT use English.\n"
        if language == "bn" else ""
    )
    return f"""
You are Shetu Saathi, an AI health companion for general patients in Bangladesh.
Analyze the health data below and provide a structured JSON response.
{lang_directive}

PATIENT CONTEXT:
{json.dumps(patient_context, indent=2, default=str)}

VITALS SUMMARY (past {vitals_data.get('days', 30)} days):
{json.dumps(vitals_data, indent=2, default=str)}

DAILY CHECK-IN SUMMARY:
{json.dumps(checkin_data, indent=2, default=str)}

HEALTH GOALS PROGRESS:
{json.dumps(goals_data, indent=2, default=str)}

Respond ONLY with valid JSON (no markdown fences) with EXACTLY these keys:
{{
  "overall_risk_band": "low|watch|elevated|urgent",
  "risk_factors": ["list of identified risks from the data"],
  "ai_summary": "3-4 sentence summary in {lang_word} — warm, clear, non-alarmist",
  "ai_summary_bn": "same summary in Bangla",
  "ai_recommendations": ["5 ordered, specific, actionable recommendations"],
  "ai_alerts": ["urgent items needing immediate attention — empty list if none"],
  "lifestyle_advice": "1-2 sentences on lifestyle improvements based on check-in patterns",
  "goal_feedback": "1 sentence feedback on their health goal progress",
  "bp_interpretation": "plain English interpretation of their BP pattern",
  "spo2_interpretation": "plain English interpretation of their SpO2 readings"
}}

Use WHO global health guidelines and Bangladesh DGHS protocols.
Be supportive, practical, and culturally sensitive.
Respond ONLY with the JSON object.
""".strip()


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
                result[key] = "low"
            else:
                result[key] = ""
    return result


async def _try_openrouter_chain(prompt: str) -> Optional[dict]:
    """Try each OpenRouter model in sequence until one succeeds."""
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
                        "X-Title": "Shetu Saathi Health Report",
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
                    logger.info("OpenRouter model %s succeeded for health analysis.", model_id)
                    return result
                else:
                    logger.warning(
                        "OpenRouter model %s returned %s: %s — trying next.",
                        model_id, resp.status_code, resp.text[:200],
                    )
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenRouter model %s failed: %s, trying next.", model_id, exc)

    return None


async def _try_ollama(prompt: str) -> Optional[dict]:
    """Final fallback — local Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            if resp.status_code == 200:
                content = resp.json().get("response", "")
                if not content or not content.strip():
                    return None
                result = _normalise(_parse_json(content))
                result["generated_by_model"] = f"ollama/{settings.OLLAMA_MODEL}"
                logger.info("Ollama model %s succeeded for health analysis.", settings.OLLAMA_MODEL)
                return result
            logger.warning("Ollama returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ollama fallback failed: %s", exc)
    return None


async def analyze_patient_health(
    vitals_data: dict,
    checkin_data: dict,
    goals_data: dict,
    patient_context: dict,
    language: str = "en",
) -> dict:
    """Return structured AI analysis; never raises — returns ai_unavailable=True on total failure."""
    prompt = _build_prompt(vitals_data, checkin_data, goals_data, patient_context, language)
    start = time.time()

    # 1. OpenRouter model chain (primary)
    result = await _try_openrouter_chain(prompt)
    if result is not None:
        result["generation_latency_ms"] = int((time.time() - start) * 1000)
        return result

    # 2. Gemini SDK models in order (fallback)
    if _GENAI_AVAILABLE and settings.GEMINI_API_KEY:
        for model_name in _GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                latency_ms = int((time.time() - start) * 1000)
                result = _normalise(_parse_json(response.text))
                result["generated_by_model"] = model_name
                result["generation_latency_ms"] = latency_ms
                logger.info("Gemini model %s succeeded for health analysis.", model_name)
                return result
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini model %s failed: %s", model_name, exc)

    # 3. Local Ollama (final fallback)
    result = await _try_ollama(prompt)
    if result is not None:
        result["generation_latency_ms"] = int((time.time() - start) * 1000)
        return result

    # 4. Total failure
    logger.error("All AI providers failed for patient health analysis.")
    return {
        "overall_risk_band": None,
        "risk_factors": [],
        "ai_summary": None,
        "ai_summary_bn": None,
        "ai_recommendations": [],
        "ai_alerts": [],
        "lifestyle_advice": None,
        "goal_feedback": None,
        "bp_interpretation": None,
        "spo2_interpretation": None,
        "generated_by_model": None,
        "generation_latency_ms": 0,
        "ai_unavailable": True,
    }
