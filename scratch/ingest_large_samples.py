import os
import sys

# Add project root directory to python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

from src.retriever import HybridRetriever

def ingest_file_if_exists(retriever, samples_dir, filename, doc_id, title, author, source):
    path = os.path.join(samples_dir, filename)
    if os.path.exists(path):
        print(f"\nReading {filename} from {path}...")
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        print(f"Ingesting '{title}' ({len(text)} characters)...")
        chunks = retriever.ingest_document(
            doc_id=doc_id,
            title=title,
            text=text,
            metadata={"author": author, "source": source}
        )
        print(f"  SUCCESS: Created {chunks} chunks.")
        return chunks
    else:
        print(f"\nFile {filename} not found. Skipping...")
        return 0

def main():
    print("Initializing HybridRetriever...")
    retriever = HybridRetriever()
    samples_dir = os.path.join(project_root, "samples")
    
    # List of files to ingest
    files_to_ingest = [
        # Novels
        ("moby_dick.txt", "moby_dick", "Moby-Dick; Or, The Whale", "Herman Melville", "Project Gutenberg"),
        ("sherlock_holmes.txt", "sherlock_holmes", "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", "Project Gutenberg"),
        ("dracula.txt", "dracula", "Dracula", "Bram Stoker", "Project Gutenberg"),
        ("frankenstein.txt", "frankenstein", "Frankenstein; Or, The Modern Prometheus", "Mary Wollstonecraft Shelley", "Project Gutenberg"),
        ("alice_in_wonderland.txt", "alice_in_wonderland", "Alice's Adventures in Wonderland", "Lewis Carroll", "Project Gutenberg"),
        
        # Technical specifications
        ("rfc6749_oauth2.txt", "rfc6749_oauth2", "RFC 6749: The OAuth 2.0 Authorization Framework", "D. Hardt, Ed.", "IETF RFC"),
        ("rfc7519_jwt.txt", "rfc7519_jwt", "RFC 7519: JSON Web Token (JWT)", "M. Jones, et al.", "IETF RFC")
    ]
    
    total_chunks = 0
    for filename, doc_id, title, author, source in files_to_ingest:
        chunks = ingest_file_if_exists(retriever, samples_dir, filename, doc_id, title, author, source)
        total_chunks += chunks
        
    print(f"\nOffline ingestion completed. Total chunks created: {total_chunks}")

if __name__ == "__main__":
    main()
