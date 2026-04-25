FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy backend code (needed for imports)
COPY backend/ ./backend/

# Copy worker code
COPY worker/ ./worker/

# Install dependencies
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set Python path
ENV PYTHONPATH=/app/backend:/app/worker

# Run worker
CMD ["python", "worker/job.py"]
