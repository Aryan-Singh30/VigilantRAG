# Use a stable, official Python base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/code/.cache/huggingface \
    PORT=7860 \
    NODE_ENV=production

# Set the working directory
WORKDIR /code

# Install system dependencies & Node.js (LTS v18)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 1. Install Python RAG Backend dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 2. Build React Frontend static files
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 3. Setup Node.js API Gateway
COPY gateway/package*.json ./gateway/
RUN cd gateway && npm install --production

# Copy build output from frontend to gateway's public directory
RUN mkdir -p gateway/public && cp -r frontend/build/* gateway/public/

# Copy the rest of the application files (including backends)
COPY . .

# Ensure start.sh has execution permissions
RUN chmod +x start.sh

# Create a writable cache directory for Hugging Face models (user 1000 compatibility)
RUN mkdir -p /code/.cache/huggingface && chmod -R 777 /code

# Pre-download and cache models in the container image during build time
RUN python download_models.py

# Pre-build FAISS/BM25 database indices during container build time
RUN python scratch/ingest_large_samples.py

# Expose port 7860 for Hugging Face Space / external access
EXPOSE 7860

# Run the startup script to concurrently run FastAPI and Node.js
CMD ["bash", "start.sh"]
