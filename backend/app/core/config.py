from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 3306
    DB_NAME: str = "dinner_service"
    DB_USER: str = "dinner_app"
    DB_PASSWORD: str = ""
    CORS_ALLOW_ORIGINS: str = "http://localhost:5173"
    APP_ENV: str = "dev"
    APP_PORT: int = 8000

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOW_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> URL:
        return URL.create(
            "mysql+pymysql",
            username=self.DB_USER,
            password=self.DB_PASSWORD,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
            query={"charset": "utf8mb4"},
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
