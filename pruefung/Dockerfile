# Multi-Stage: Build-Layer holt Compile-Deps für weasyprint,
# Runtime-Image bleibt schlank.
FROM python:3.12-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    fonts-open-sans \
    tesseract-ocr tesseract-ocr-deu \
 && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

COPY src ./src
COPY tests ./tests

FROM python:3.12-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    fonts-open-sans \
    tesseract-ocr tesseract-ocr-deu \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /app/src /app/src
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["uvicorn", "pruefung.main:app", "--host", "0.0.0.0", "--port", "8000"]
