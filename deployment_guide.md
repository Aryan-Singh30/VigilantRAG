# Deployment Guide: Host VigilantRAG Live on Hugging Face Spaces

This guide walks you through deploying **VigilantRAG** to **Hugging Face Spaces** for free in under 5 minutes. Pushing this to Hugging Face provides you with a public HTTPS link (e.g. `https://huggingface.co/spaces/your-username/VigilantRAG`) that recruiters can click directly to try your project.

---

## Why Hugging Face Spaces?

Standard free web hosts (like Render, Fly.io, or Railway) limit free tier memory to **512 MB RAM**. Loading PyTorch, Sentence-Transformers, and a local LLM will cause these hosts to crash immediately with Out-Of-Memory (OOM) errors.

Hugging Face Spaces offers a **100% Free CPU tier with 16 GB RAM and 2 vCPUs**. This is more than enough to load and execute our lightweight models (`Qwen2.5-0.5B` and `DeBERTa-v3-xsmall`) quickly.

---

## Step-by-Step Deployment

There are two ways to deploy: **Option A (Web Upload - easiest)** or **Option B (Git Push - professional)**.

### Step 1: Create a Hugging Face Account & Space
1. Go to [Hugging Face](https://huggingface.co) and sign up for a free account.
2. Click on your profile picture in the top-right corner and select **"New Space"**.
3. Fill in the following details:
   * **Space Name**: `VigilantRAG` (or anything you prefer)
   * **License**: `mit`
   * **Select the Space SDK**: **Docker** (Very important!)
   * **Docker Template**: **Blank**
   * **Space Hardware**: **CPU Basic (Free • 16GB RAM • 2 vCPUs)**
   * **Privacy**: **Public** (so recruiters can access it!)
4. Click **"Create Space"**.

---

### Option A: Deploy using Web Interface (No Git needed)
If you don't want to use the command line, you can drag and drop your files:
1. In your newly created Space, click on the **"Files"** tab.
2. Click **"Add file"** -> **"Upload files"**.
3. Drag and drop all the project files from your local folder `C:\projects_aryan\VigilantRAG` **except** the `venv/` folder and `test_data_cache/` / `test_api_cache/` if they exist.
4. Ensure your folder structure on the website matches this:
   ```
   ├── src/
   │   ├── __init__.py
   │   ├── config.py
   │   ├── retriever.py
   │   ├── reranker.py
   │   ├── query_expansion.py
   │   ├── hallucination_guard.py
   │   ├── llm_client.py
   │   └── engine.py
   ├── static/
   │   ├── index.html
   │   ├── style.css
   │   └── main.js
   ├── app.py
   ├── download_models.py
   ├── requirements.txt
   └── Dockerfile
   ```
5. Click **"Commit changes to main"** at the bottom of the page.
6. Skip to **Step 2 (Building & Running)**.

---

### Option B: Deploy using Git Push (Recommended for Resume)
This demonstrates standard developer workflows:
1. In your local terminal, navigate to your project directory:
   ```bash
   cd C:\projects_aryan\VigilantRAG
   ```
2. Initialize git and commit files:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of VigilantRAG self-correcting engine"
   ```
3. Add the Hugging Face Space as a git remote. Hugging Face provides this exact command on your Space's landing page:
   ```bash
   git remote add origin https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME
   ```
4. Push your code (you will need to input your Hugging Face username and a **User Access Token** as your password. Generate a token in your HF profile under Settings -> Access Tokens):
   ```bash
   git push -u origin main --force
   ```

---

## Step 2: Building & Running

Once you commit or push your code:
1. Go to the **"App"** tab of your Hugging Face Space.
2. You will see a status badge: **"Building"**.
3. Hugging Face is currently:
   * Setting up the Linux environment.
   * Installing PyTorch, FastAPI, FAISS, and other dependencies.
   * Running `download_models.py` to pre-download the model weights and bake them directly into the container image.
4. The build process takes about **5 to 8 minutes** (primarily downloading the 0.5B model weights).
5. Once the build completes, the status badge will change to a green **"Running"**.
6. The dashboard will render inside the Space, and you can copy the URL in your address bar and paste it directly onto your resume!
