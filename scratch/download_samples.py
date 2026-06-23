import os
import sys
import httpx

def download_file(urls, dest_path, min_bytes=1000):
    """
    Tries to download a file from a list of candidate URLs.
    Ensures the downloaded file has a minimum size.
    """
    client = httpx.Client(timeout=30.0, follow_redirects=True)
    for url in urls:
        print(f"Trying to download from: {url}")
        try:
            res = client.get(url)
            if res.status_code == 200:
                content = res.text
                if len(content.encode('utf-8')) >= min_bytes:
                    # Check for common 404 pages returned as 200
                    if "404: Not Found" in content or "Not Found" == content.strip():
                        print(f"  Url returned a 200 but content indicates 404. Skipping...")
                        continue
                    with open(dest_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    print(f"  SUCCESS! Saved {len(content.encode('utf-8'))/1024:.1f} KB to {dest_path}")
                    return True
                else:
                    print(f"  File too small ({len(content.encode('utf-8'))} bytes). Skipping...")
            else:
                print(f"  Failed with status code: {res.status_code}")
        except Exception as e:
            print(f"  Error: {str(e)}")
    return False

def main():
    samples_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples")
    os.makedirs(samples_dir, exist_ok=True)
    
    # 1. Moby Dick Candidates
    moby_urls = [
        "https://raw.githubusercontent.com/streams-github/text-mining/master/data/moby-dick.txt",
        "https://raw.githubusercontent.com/gitenberg-dev/moby-dick-2701/master/2701-0.txt",
        "https://raw.githubusercontent.com/alex-b-b/NLP-moby-dick/master/moby.txt",
        "https://www.gutenberg.org/files/2701/2701-0.txt"
    ]
    moby_dest = os.path.join(samples_dir, "moby_dick.txt")
    print("Downloading Moby Dick...")
    download_file(moby_urls, moby_dest, min_bytes=100000)

    # 2. RFC 6749 (OAuth 2.0)
    oauth2_urls = [
        "https://www.rfc-editor.org/rfc/rfc6749.txt",
        "https://www.ietf.org/rfc/rfc6749.txt"
    ]
    oauth2_dest = os.path.join(samples_dir, "rfc6749_oauth2.txt")
    print("\nDownloading RFC 6749 (OAuth 2.0 Specification)...")
    download_file(oauth2_urls, oauth2_dest, min_bytes=50000)

    # 3. RFC 7519 (JWT)
    jwt_urls = [
        "https://www.rfc-editor.org/rfc/rfc7519.txt",
        "https://www.ietf.org/rfc/rfc7519.txt"
    ]
    jwt_dest = os.path.join(samples_dir, "rfc7519_jwt.txt")
    print("\nDownloading RFC 7519 (JSON Web Token Specification)...")
    download_file(jwt_urls, jwt_dest, min_bytes=20000)

    print("\nAll download tasks completed.")

if __name__ == "__main__":
    main()
