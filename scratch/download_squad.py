import os
import sys
import json
import httpx

def download_and_ingest_squad(server_url: str = "http://localhost:8000"):
    squad_url = "https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v2.0.json"
    print(f"Downloading SQuAD 2.0 dev dataset from {squad_url}...")
    
    client = httpx.Client(timeout=60.0)
    try:
        response = client.get(squad_url)
        if response.status_code != 200:
            print("Failed to download SQuAD dataset.")
            return
        squad_data = response.json()
    except Exception as e:
        print(f"Error downloading: {str(e)}")
        return

    # SQuAD structure: data -> list of articles -> paragraphs -> context
    articles = squad_data.get("data", [])
    print(f"Successfully downloaded SQuAD. Found {len(articles)} topics/articles.")
    
    # Ensure server is running
    try:
        client.get(f"{server_url}/")
    except Exception:
        print(f"ERROR: Could not connect to VigilantRAG server at {server_url}.")
        return

    # Ingest the first 5 articles (approx. 200 paragraphs/contexts)
    # This is a good volume for testing without overloading a local CPU index
    limit_articles = 5
    sample_questions = []

    print(f"\nIngesting the first {limit_articles} topics into VigilantRAG...")
    
    for i, article in enumerate(articles[:limit_articles]):
        title = article.get("title", f"SQuAD_Article_{i}")
        doc_id = f"squad_{title.lower().replace(' ', '_')}"
        
        paragraphs = article.get("paragraphs", [])
        print(f"\n[{i+1}/{limit_articles}] Ingesting topic '{title}' ({len(paragraphs)} paragraphs)...")
        
        # Combine all paragraph contexts into a single text document
        full_text_list = []
        for idx, para in enumerate(paragraphs):
            context = para.get("context", "")
            full_text_list.append(context)
            
            # Save 3 sample questions from this article for the user to try
            qas = para.get("qas", [])
            for qa in qas[:3]:
                if not qa.get("is_impossible", False):
                    sample_questions.append({
                        "topic": title,
                        "question": qa.get("question")
                    })
        
        full_text = "\n\n".join(full_text_list)
        
        # Ingest document
        payload = {
            "doc_id": doc_id,
            "title": f"SQuAD: {title}",
            "text": full_text,
            "metadata": {"source": "SQuAD_2.0_Dev", "topic": title}
        }
        
        try:
            res = client.post(f"{server_url}/api/ingest", json=payload)
            if res.status_code == 200:
                print(f"  SUCCESS: Ingested '{title}' ({res.json().get('chunks_created')} chunks created)")
            else:
                print(f"  FAIL: Ingest returned status {res.status_code}")
        except Exception as e:
            print(f"  ERROR: {str(e)}")

    # Write sample questions to a file
    questions_file = "squad_test_questions.txt"
    with open(questions_file, "w", encoding="utf-8") as f:
        f.write("=== SQuAD 2.0 Sample Questions to Test ===\n")
        f.write("Copy and paste these questions into the VigilantRAG dashboard search bar:\n\n")
        
        current_topic = ""
        for q in sample_questions[:30]:  # Limit to top 30
            if q["topic"] != current_topic:
                current_topic = q["topic"]
                f.write(f"\nTopic: {current_topic}\n" + "-"*len(current_topic) + "\n")
            f.write(f"- {q['question']}\n")
            
    print(f"\nDone! Ingestion complete. Sample test questions saved to: {os.path.abspath(questions_file)}")

if __name__ == "__main__":
    download_and_ingest_squad()
