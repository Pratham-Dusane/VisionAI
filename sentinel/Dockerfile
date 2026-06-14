FROM python:3.11-slim

WORKDIR /app

# Install system deps (needed for some ML libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run with multiple workers for concurrency
# Each worker handles requests independently — Redis keeps window state shared
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2", "--loop", "uvloop"]
