"""Supabase REST + Storage-Client (direkter httpx, keine ESM-Klimmzüge wie in UE1)."""
import os
from typing import Any
import httpx


class SupabaseClient:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self._headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept-Profile": "apl2",
            "Content-Profile": "apl2",
        }

    @classmethod
    def from_env(cls) -> "SupabaseClient":
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein")
        return cls(url, key)

    async def select(self, table: str, query: str = "select=*") -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"{self.url}/rest/v1/{table}?{query}", headers=self._headers)
            r.raise_for_status()
            return r.json()

    async def insert(self, table: str, rows: list[dict] | dict) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{self.url}/rest/v1/{table}",
                json=rows if isinstance(rows, list) else [rows],
                headers={**self._headers, "Prefer": "return=representation"},
            )
            r.raise_for_status()
            return r.json()

    async def update(self, table: str, query: str, patch: dict) -> list[dict]:
        """PATCH /rest/v1/{table}?{query}. query ist z.B. 'id=eq.{uuid}'.
        Wird u.a. für 'Prüfung abschließen' und 'Antrags-Status setzen' genutzt."""
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.patch(
                f"{self.url}/rest/v1/{table}?{query}",
                json=patch,
                headers={**self._headers, "Prefer": "return=representation"},
            )
            r.raise_for_status()
            return r.json()

    async def delete(self, table: str, query: str) -> int:
        """DELETE /rest/v1/{table}?{query}. query ist z.B. 'id=eq.{uuid}'.
        Returnt die Anzahl gelöschter Zeilen (über Content-Range-Header)."""
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.delete(
                f"{self.url}/rest/v1/{table}?{query}",
                headers={**self._headers, "Prefer": "return=representation,count=exact"},
            )
            r.raise_for_status()
            data = r.json() if r.content else []
            return len(data) if isinstance(data, list) else 0

    async def delete_storage(self, bucket: str, path: str) -> None:
        """Löscht ein Objekt aus dem Storage-Bucket."""
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.delete(
                f"{self.url}/storage/v1/object/{bucket}/{path}",
                headers=self._headers,
            )
            # 404 ist ok — Objekt war bereits weg
            if r.status_code not in (200, 204, 404):
                r.raise_for_status()

    async def upload_storage(self, bucket: str, path: str, content: bytes, content_type: str) -> str:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                f"{self.url}/storage/v1/object/{bucket}/{path}",
                content=content,
                headers={**self._headers, "Content-Type": content_type, "x-upsert": "true"},
            )
            r.raise_for_status()
            return path
