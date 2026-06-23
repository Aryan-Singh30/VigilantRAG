# Use a stable, official Python base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/code/.cache/huggingface \
    PORT=7860

# Set the working directory
WORKDIR /code

# Install system dependencies (git is sometimes used by HF libraries)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to leverage Docker layer caching
COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create a writable cache directory for Hugging Face models
# Hugging Face Spaces runs as user 1000, so we must make /code writable
RUN mkdir -p /code/.cache/huggingface && chmod -R 777 /code

# Copy the rest of the application files
COPY . .

# Pre-download and cache models in the container image during build time
RUN python download_models.py

# Expose port 7860 for Hugging Face Space / external access
EXPOSE 7860

# Run the FastAPI application on host 0.0.0.0 and port 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
