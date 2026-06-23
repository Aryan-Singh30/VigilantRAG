import os
import sys

# Add project root directory to python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

from src.retriever import HybridRetriever

def main():
    retriever = HybridRetriever()
    print("Ingested Documents:")
    for doc_id, doc in retriever.documents.items():
        print(f" - ID: {doc_id} | Title: {doc.title} | Length: {len(doc.text)} chars")

if __name__ == "__main__":
    main()
