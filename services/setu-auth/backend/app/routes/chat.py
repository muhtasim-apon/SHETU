"""Health Assistant chat endpoint — conversational AI powered by Gemini."""
import logging
import re
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["chat"])

try:
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
    "gemini-flash-latest",
]

# Reliable-first, live-verified 2026-06-11. Dead/empty-output IDs removed.
_OPENROUTER_MODELS = [
    "openai/gpt-oss-20b:free",
    "openai/gpt-oss-120b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
]

_SYSTEM_PROMPT = """You are Shetu Saathi, a friendly and knowledgeable AI health companion for patients in Bangladesh. You help users understand health topics, interpret symptoms, suggest when to see a doctor, and provide general wellness guidance.

Guidelines:
- Be warm, empathetic, and culturally sensitive to the Bangladeshi context
- Provide evidence-based information following WHO, CDC, and Bangladesh DGHS guidelines
- Always recommend consulting a qualified doctor for diagnosis or treatment decisions
- Answer in the same language the user writes in (English or Bangla)
- Keep responses concise and easy to understand
- For emergencies (chest pain, difficulty breathing, stroke symptoms), always advise calling 999 immediately
- Do not provide specific medication dosages or act as a replacement for professional medical advice

You can discuss: symptoms, diseases, nutrition, mental health, maternal health, preventive care, medication side effects (general info), lab results interpretation (general info), and healthy lifestyle tips."""


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    model: Optional[str] = None


async def _call_openrouter_chain(messages: list[dict]) -> Optional[tuple[str, str]]:
    """Try each OpenRouter model in sequence. Returns (reply, model_id) or None."""
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
                        "X-Title": "Shetu Saathi Chat",
                    },
                    json={
                        "model": model_id,
                        "messages": [{"role": "system", "content": _SYSTEM_PROMPT}] + messages,
                        "max_tokens": 1000,
                    },
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    if not content or not content.strip():
                        logger.warning("OpenRouter model %s returned empty content, trying next.", model_id)
                        continue
                    logger.info("OpenRouter model %s succeeded for chat.", model_id)
                    return content, model_id
                else:
                    logger.warning(
                        "OpenRouter model %s returned %s: %s — trying next.",
                        model_id, resp.status_code, resp.text[:200],
                    )
        except Exception as exc:
            logger.warning("OpenRouter model %s chat failed: %s, trying next.", model_id, exc)
    return None


@router.post("/chat", response_model=ChatResponse)
async def health_chat(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages provided.")

    gemini_messages = [{"role": m.role, "parts": [m.content]} for m in req.messages]
    openrouter_messages = [{"role": m.role, "content": m.content} for m in req.messages]

    # 1. Try Gemini SDK models in order
    if _GENAI_AVAILABLE and settings.GEMINI_API_KEY:
        for model_name in _GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(
                    model_name,
                    system_instruction=_SYSTEM_PROMPT,
                )
                history = [
                    {"role": m["role"], "parts": m["parts"]}
                    for m in gemini_messages[:-1]
                ]
                chat = model.start_chat(history=history)
                response = chat.send_message(gemini_messages[-1]["parts"][0])
                return ChatResponse(reply=response.text.strip(), model=model_name)
            except Exception as exc:
                logger.warning("Gemini %s chat failed: %s", model_name, exc)

    # 2. OpenRouter model chain fallback
    result = await _call_openrouter_chain(openrouter_messages)
    if result:
        reply, model_id = result
        return ChatResponse(reply=reply.strip(), model=f"openrouter/{model_id}")

    raise HTTPException(
        status_code=503,
        detail="Health assistant is temporarily unavailable. Please try again later.",
    )
