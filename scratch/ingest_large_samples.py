import os
import sys

# Add project root directory to python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

from src.retriever import HybridRetriever

def main():
    print("Initializing HybridRetriever...")
    retriever = HybridRetriever()
    samples_dir = os.path.join(project_root, "samples")
    
    # 1. Moby Dick
    moby_path = os.path.join(samples_dir, "moby_dick.txt")
    if os.path.exists(moby_path):
        print(f"Reading Moby Dick from {moby_path}...")
        with open(moby_path, "r", encoding="utf-8") as f:
            text = f.read()
        print(f"Ingesting 'Moby-Dick; Or, The Whale' ({len(text)} characters)...")
        chunks = retriever.ingest_document(
            doc_id="moby_dick",
            title="Moby-Dick; Or, The Whale",
            text=text,
            metadata={"author": "Herman Melville", "source": "Project Gutenberg"}
        )
        print(f"  SUCCESS: Created {chunks} chunks.")
    else:
        print("Moby Dick text file not found.")

    # 2. RFC 6749 (OAuth 2.0)
    oauth2_path = os.path.join(samples_dir, "rfc6749_oauth2.txt")
    if os.path.exists(oauth2_path):
        print(f"\nReading RFC 6749 from {oauth2_path}...")
        with open(oauth2_path, "r", encoding="utf-8") as f:
            text = f.read()
        print(f"Ingesting 'RFC 6749: The OAuth 2.0 Authorization Framework' ({len(text)} characters)...")
        chunks = retriever.ingest_document(
            doc_id="rfc6749_oauth2",
            title="RFC 6749: The OAuth 2.0 Authorization Framework",
            text=text,
            metadata={"author": "D. Hardt, Ed.", "source": "IETF RFC"}
        )
        print(f"  SUCCESS: Created {chunks} chunks.")
    else:
        print("RFC 6749 text file not found.")

    # 3. RFC 7519 (JWT)
    jwt_path = os.path.join(samples_dir, "rfc7519_jwt.txt")
    if os.path.exists(jwt_path):
        print(f"\nReading RFC 7519 from {jwt_path}...")
        with open(jwt_path, "r", encoding="utf-8") as f:
            text = f.read()
        print(f"Ingesting 'RFC 7519: JSON Web Token (JWT)' ({len(text)} characters)...")
        chunks = retriever.ingest_document(
            doc_id="rfc7519_jwt",
            title="RFC 7519: JSON Web Token (JWT)",
            text=text,
            metadata={"author": "M. Jones, et al.", "source": "IETF RFC"}
        )
        print(f"  SUCCESS: Created {chunks} chunks.")
    else:
        print("RFC 7519 text file not found.")

    print("\nOffline ingestion of large samples completed successfully!")

if __name__ == "__main__":
    main()
