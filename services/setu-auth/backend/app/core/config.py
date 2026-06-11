"""Application configuration loaded from environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed settings sourced from the backend `.env` file."""

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    PORT: int = 8000

    # ── Shetu Saathi (patient module) settings ──────────────────────────────
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    BMDC_API_BASE: str = "https://www.bmdc.org.bd"
    WHO_RSS_URL: str = "https://www.who.int/rss-feeds/news-english.xml"
    CDC_RSS_URL: str = "https://tools.cdc.gov/podcasts/feed.asp?feedid=183"
    NHS_RSS_URL: str = "https://www.england.nhs.uk/feed/"
    REPORT_STORAGE_PATH: str = "./generated_reports"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        """Return ALLOWED_ORIGINS as a clean list of origins."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor so the env file is only parsed once."""
    return Settings()


settings = get_settings()
