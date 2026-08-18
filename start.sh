#!/bin/bash

# Exit immediately if any command fails
set -e

echo "🚀 Launching Python RAG FastAPI Engine on port 8000..."
# Bind Python to loopback interface 127.0.0.1:8000 for secure isolation
python -m uvicorn app:app --host 127.0.0.1 --port 8000 &

echo "⚡ Starting Node.js API Gateway on exposed port $PORT..."
# Bind Node Gateway to $PORT (injected by Hugging Face Spaces, default 7860)
cd gateway
exec node server.js
