import os
import sys
import time
import httpx

def download_and_ingest_books(num_books: int = 50, server_url: str = "http://localhost:8000"):
    print(f"Starting bulk downloader. Target: {num_books} books.")
    print(f"Targeting local VigilantRAG server: {server_url}\n")

    # Ensure server is running
    try:
        httpx.get(f"{server_url}/")
    except Exception:
        print(f"ERROR: Could not connect to VigilantRAG server at {server_url}.")
        print("Please ensure the FastAPI server is running (venv\\Scripts\\python app.py) before executing this script.")
        return

    client = httpx.Client(timeout=60.0)
    downloaded_count = 0
    
    # We query Gutendex (Project Gutenberg search index API) for popular books
    # Page size is 32 books per page
    page = 1
    
    while downloaded_count < num_books:
        api_url = f"https://gutendex.com/books/?page={page}"
        print(f"Fetching book list metadata from Gutenberg index (Page {page})...")
        
        try:
            response = client.get(api_url)
            if response.status_code != 200:
                print("Failed to retrieve book directory page.")
                break
                
            results = response.json().get("results", [])
            if not results:
                print("No more books available.")
                break
                
            for book in results:
                if downloaded_count >= num_books:
                    break
                    
                # Find plain text format URL
                formats = book.get("formats", {})
                text_url = formats.get("text/plain; charset=utf-8") or formats.get("text/plain")
                
                if not text_url:
                    continue  # Skip if no plain text version exists
                    
                title = book.get("title", "Unknown Title")
                author = "Unknown"
                if book.get("authors"):
                    author = book["authors"][0].get("name", "Unknown")
                    
                book_id = f"gutenberg_{book.get('id')}"
                
                print(f"[{downloaded_count + 1}/{num_books}] Downloading '{title}' by {author}...")
                
                try:
                    book_res = client.get(text_url)
                    if book_res.status_code != 200:
                        print("  Failed to download book text. Skipping...")
                        continue
                        
                    raw_text = book_res.text
                    
                    # Ingest via local server
                    print(f"  Ingesting into VigilantRAG ({len(raw_text) / 1024:.1f} KB)...")
                    ingest_payload = {
                        "doc_id": book_id,
                        "title": title,
                        "text": raw_text,
                        "metadata": {"author": author, "source": "project_gutenberg"}
                    }
                    
                    ingest_res = client.post(f"{server_url}/api/ingest", json=ingest_payload)
                    
                    if ingest_res.status_code == 200:
                        chunks = ingest_res.json().get("chunks_created", 0)
                        print(f"  SUCCESS: Chunks indexed: {chunks}")
                        downloaded_count += 1
                    else:
                        print(f"  FAIL: Server responded with status code {ingest_res.status_code}")
                except Exception as e:
                    print(f"  ERROR processing book: {str(e)}")
                    
                # Avoid rate limiting Gutenberg/Gutendex API
                time.sleep(1.5)
                
            page += 1
            
        except Exception as e:
            print(f"API Directory call failed: {str(e)}")
            break

    print(f"\nCompleted! Successfully ingested {downloaded_count} books into your database.")

if __name__ == "__main__":
    # You can change this number.
    # 50 books is about 40MB-50MB of text.
    # 200 books is about 200MB.
    # 1000 books is about 1GB.
    target_books = 50
    if len(sys.argv) > 1:
        try:
            target_books = int(sys.argv[1])
        except ValueError:
            pass
            
    download_and_ingest_books(target_books)
