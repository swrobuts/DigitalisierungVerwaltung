"""FastAPI-Service für UE3 KI-gestützte Prüfung von APL2-Anträgen."""
from fastapi import FastAPI

app = FastAPI(title="UE3 APL2-Prüfung", version="0.1.0")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
