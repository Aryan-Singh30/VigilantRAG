import os
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from src.engine import VigilantRAGEngine
from src.config import config
from src.parser import parse_file

# Initialize FastAPI app
app = FastAPI(
    title="VigilantRAG API",
    description="Backend API for the Self-Correcting Multi-Stage RAG Engine",
    version="1.0.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"], # Allow Node.js backend proxy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize global engine
engine = VigilantRAGEngine()

# Request/Response schemas
class QueryRequest(BaseModel):
    query: str = Field(..., example="What are the remote work guidelines?")
    use_reranking: Optional[bool] = Field(default=True)
    use_nli_guard: Optional[bool] = Field(default=True)
    limit_document_id: Optional[str] = Field(default=None)
    relevance_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    nli_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)

class IngestRequest(BaseModel):
    doc_id: str = Field(..., example="doc_remote_policy")
    title: str = Field(..., example="Remote Work Policy 2026")
    text: str = Field(..., example="Employees can work remotely up to 3 days per week with manager approval...")
    metadata: Dict[str, Any] = Field(default_factory=dict)

# API Endpoints
@app.post("/api/query")
def run_query(payload: QueryRequest):
    """Executes a search query through the self-correcting RAG pipeline."""
    try:
        # Build overrides configuration mapping
        overrides = {}
        if payload.relevance_threshold is not None:
            overrides["relevance_threshold"] = payload.relevance_threshold
        if payload.nli_threshold is not None:
            overrides["nli_threshold"] = payload.nli_threshold
        if payload.temperature is not None:
            overrides["temperature_default"] = payload.temperature

        # Plan-based capability limits overrides passed from Gateway
        overrides["use_reranking"] = payload.use_reranking
        overrides["use_nli_guard"] = payload.use_nli_guard
        overrides["limit_document_id"] = payload.limit_document_id

        # Execute query passing the overrides mapping
        result = engine.query(payload.query, config_overrides=overrides)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest")
def ingest_document(payload: IngestRequest):
    """Ingests a text document, chunks it, and rebuilds search indexes."""
    try:
        chunk_count = engine.retriever.ingest_document(
            doc_id=payload.doc_id,
            title=payload.title,
            text=payload.text,
            metadata=payload.metadata
        )
        return {
            "status": "success",
            "message": f"Document '{payload.title}' ingested successfully.",
            "doc_id": payload.doc_id,
            "chunks_created": chunk_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest-file")
async def ingest_file(
    doc_id: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...)
):
    """Parses and ingests an uploaded file (.pdf, .docx, .xlsx, .txt)."""
    try:
        file_bytes = await file.read()
        parsed_text = parse_file(file.filename, file_bytes)
        
        chunk_count = engine.retriever.ingest_document(
            doc_id=doc_id,
            title=title,
            text=parsed_text,
            metadata={"filename": file.filename}
        )
        
        return {
            "status": "success",
            "message": f"File '{file.filename}' parsed and ingested successfully.",
            "doc_id": doc_id,
            "chunks_created": chunk_count,
            "text_length": len(parsed_text)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File ingestion failed: {str(e)}")

@app.get("/api/documents")
def list_documents():
    """Lists currently ingested documents and chunk details."""
    try:
        docs_summary = []
        for doc_id, doc in engine.retriever.documents.items():
            # Count chunks for this doc
            doc_chunks = [c for c in engine.retriever.chunks if c.doc_id == doc_id]
            docs_summary.append({
                "id": doc_id,
                "title": doc.title,
                "text_length": len(doc.text),
                "chunks_count": len(doc_chunks),
                "metadata": doc.metadata
            })
        return docs_summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    """Retrieves full text and details of a specific document."""
    try:
        if doc_id in engine.retriever.documents:
            doc = engine.retriever.documents[doc_id]
            return {
                "id": doc.id,
                "title": doc.title,
                "text": doc.text,
                "metadata": doc.metadata
            }
        else:
            raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    """Deletes a document and its chunks from the retriever index."""
    try:
        success = engine.retriever.delete_document(doc_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Document with ID '{doc_id}' not found.")
        return {
            "status": "success",
            "message": f"Document '{doc_id}' deleted successfully."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Setup Static File Serving
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)

# Mount static folder
# app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def read_root():
    """Serves the frontend dashboard landing page."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "VigilantRAG API is running. Build the Web UI static files to access the frontend dashboard at static/index.html."}

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
