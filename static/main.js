// Global State
let currentTelemetry = null;
let apiBaseUrl = window.location.origin; // Dynamically bind to current host (works locally and on HF spaces!)

// DOM Elements
const docIdInput = document.getElementById("doc-id");
const docTitleInput = document.getElementById("doc-title");
const docTextInput = document.getElementById("doc-text");
const btnIngest = document.getElementById("btn-ingest");
const documentsList = document.getElementById("documents-list");
const ingestForm = document.getElementById("ingest-form");

const searchQueryInput = document.getElementById("search-query");
const btnSearch = document.getElementById("btn-search");
const btnSearchText = document.getElementById("btn-search-text");

const welcomeSection = document.getElementById("welcome-section");
const resultsSection = document.getElementById("results-section");

const answerText = document.getElementById("answer-text");
const answerBadge = document.getElementById("answer-badge");
const totalTimeBadge = document.getElementById("total-time-badge");
const correctionsBadge = document.getElementById("corrections-badge");

const detailsTitle = document.getElementById("details-title");
const detailsSubtitle = document.getElementById("details-subtitle");
const detailsContent = document.getElementById("details-content");

// Stats Indicators
const statQueriesVal = document.querySelector("#stat-queries .stat-value");
const statExpansionsVal = document.querySelector("#stat-expansions .stat-value");
const statBlocksVal = document.querySelector("#stat-blocks .stat-value");

// Slider Parameters
const paramRelevance = document.getElementById("param-relevance");
const paramNli = document.getElementById("param-nli");
const paramTemp = document.getElementById("param-temp");
const valRelevance = document.getElementById("val-relevance");
const valNli = document.getElementById("val-nli");
const valTemp = document.getElementById("val-temp");

// Global statistics counters
let totalQueries = 0;
let totalCorrections = 0;
let totalBlocks = 0;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    // Sliders event listeners
    paramRelevance.addEventListener("input", (e) => { valRelevance.textContent = parseFloat(e.target.value).toFixed(2); });
    paramNli.addEventListener("input", (e) => { valNli.textContent = parseFloat(e.target.value).toFixed(2); });
    paramTemp.addEventListener("input", (e) => { valTemp.textContent = parseFloat(e.target.value).toFixed(2); });

    // Ingest submit listener
    ingestForm.addEventListener("submit", handleIngestion);

    // Search click & enter key
    btnSearch.addEventListener("click", executeSearch);
    searchQueryInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") executeSearch();
    });

    // Setup timeline step click listeners
    const steps = document.querySelectorAll(".timeline-step");
    steps.forEach(step => {
        step.addEventListener("click", () => {
            if (!currentTelemetry) return;
            
            // Toggle active classes on steps
            steps.forEach(s => s.classList.remove("active-selected"));
            step.classList.add("active-selected");
            
            const stepName = step.getAttribute("data-step");
            showStepDetails(stepName);
        });
    });

    // Load initial documents
    listDocuments();
});

// Load Ingested Documents List
async function listDocuments() {
    try {
        const response = await fetch(`${apiBaseUrl}/api/documents`);
        if (!response.ok) throw new Error("Failed to load documents list.");
        
        const docs = await response.json();
        
        if (docs.length === 0) {
            documentsList.innerHTML = `<p class="empty-list-text">No documents indexed yet.</p>`;
            return;
        }

        documentsList.innerHTML = "";
        docs.forEach(doc => {
            const item = document.createElement("div");
            item.className = "doc-inventory-item";
            
            // Round document size for readability
            const kbSize = (doc.text_length / 1024).toFixed(1);
            
            item.innerHTML = `
                <div class="doc-info">
                    <h4>${doc.title}</h4>
                    <span>ID: ${doc.id} • ${kbSize} KB • ${doc.chunks_count} chunks</span>
                </div>
                <button class="btn-delete" data-id="${doc.id}" title="Delete document">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            
            // Delete button functionality
            item.querySelector(".btn-delete").addEventListener("click", async (e) => {
                const docId = e.currentTarget.getAttribute("data-id");
                if (confirm(`Are you sure you want to delete document "${docId}"? This will rebuild the index.`)) {
                    await deleteDocument(docId);
                }
            });
            
            documentsList.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        documentsList.innerHTML = `<p class="empty-list-text text-danger">Error loading inventory.</p>`;
    }
}

// Ingest a document
async function handleIngestion(e) {
    e.preventDefault();
    
    const docId = docIdInput.value.trim();
    const title = docTitleInput.value.trim();
    const text = docTextInput.value.trim();

    if (!docId || !title || !text) return;

    btnIngest.disabled = true;
    btnIngest.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;

    try {
        const response = await fetch(`${apiBaseUrl}/api/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doc_id: docId, title: title, text: text })
        });

        if (!response.ok) throw new Error("Error occurred during document ingestion.");
        
        const resData = await response.json();
        alert(resData.message);
        
        // Reset inputs
        docIdInput.value = "";
        docTitleInput.value = "";
        docTextInput.value = "";
        
        // Refresh list
        listDocuments();
    } catch (err) {
        alert(err.message);
    } finally {
        btnIngest.disabled = false;
        btnIngest.innerHTML = `<i class="fa-solid fa-upload"></i> Process & Index`;
    }
}

// Delete a document
async function deleteDocument(docId) {
    try {
        const response = await fetch(`${apiBaseUrl}/api/documents/${docId}`, {
            method: "DELETE"
        });
        if (!response.ok) throw new Error("Error deleting document.");
        
        // Refresh list
        listDocuments();
    } catch (err) {
        alert(err.message);
    }
}

// Execute Query Search
async function executeSearch() {
    const query = searchQueryInput.value.trim();
    if (!query) return;

    // Reset UI and show loading states
    btnSearch.disabled = true;
    btnSearchText.textContent = "Processing...";
    btnSearch.querySelector("i").className = "fa-solid fa-circle-notch fa-spin";
    
    welcomeSection.style.display = "none";
    resultsSection.style.display = "block";
    
    // Clear answer panel and reset trace nodes
    answerText.innerHTML = `
        <div style="color: var(--text-muted); display:flex; align-items:center; gap: 10px; padding: 2rem 0;">
            <i class="fa-solid fa-circle-notch fa-spin fa-lg" style="color: var(--accent-blue)"></i>
            <span>Orchestrating self-correcting RAG loop (resolving indices, query synonyms, and NLI verification)...</span>
        </div>
    `;
    answerBadge.className = "badge badge-warning";
    answerBadge.textContent = "Processing";
    
    resetTimeline();
    
    // Get parameter thresholds
    const relevance_threshold = parseFloat(paramRelevance.value);
    const nli_threshold = parseFloat(paramNli.value);
    const temperature = parseFloat(paramTemp.value);

    try {
        const response = await fetch(`${apiBaseUrl}/api/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: query,
                relevance_threshold: relevance_threshold,
                nli_threshold: nli_threshold,
                temperature: temperature
            })
        });

        if (!response.ok) throw new Error("RAG execution failed on the server.");

        const data = await response.json();
        currentTelemetry = data.telemetry;

        // Display results
        displayAnswer(data.answer, data.telemetry);
        updatePipelineVisualization(data.telemetry);
        
        // Increment statistics
        totalQueries++;
        if (data.telemetry.query_expansion_triggered) totalCorrections++;
        totalBlocks += data.telemetry.hallucination_blocked_count;
        
        // Update stats UI
        statQueriesVal.textContent = totalQueries;
        statExpansionsVal.textContent = totalCorrections;
        statBlocksVal.textContent = totalBlocks;

    } catch (err) {
        answerText.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${err.message}</span>`;
        answerBadge.className = "badge badge-danger";
        answerBadge.textContent = "Error";
    } finally {
        btnSearch.disabled = false;
        btnSearchText.textContent = "Search";
        btnSearch.querySelector("i").className = "fa-solid fa-chevron-right";
    }
}

// Display final answer
function displayAnswer(answer, telemetry) {
    answerText.textContent = answer;
    
    // Update badge status based on verification outcome
    if (telemetry.success) {
        answerBadge.className = "badge badge-success";
        answerBadge.textContent = "Verified Factual";
    } else {
        answerBadge.className = "badge badge-danger";
        answerBadge.textContent = "Unverified Fallback";
    }

    totalTimeBadge.innerHTML = `<i class="fa-regular fa-clock"></i> Response Time: ${telemetry.execution_time_sec.toFixed(2)}s`;
    
    const expansionsCount = telemetry.retrieval_attempts.length - 1;
    correctionsBadge.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Queries Expanded: ${expansionsCount}`;
}

// Reset trace map classes
function resetTimeline() {
    const nodes = ["input", "retrieval", "rerank", "expansion", "generation", "guard"];
    nodes.forEach(node => {
        const element = document.getElementById(`step-node-${node}`);
        element.className = "timeline-step";
    });
    
    // Welcome subpanel reset
    detailsTitle.innerHTML = `<i class="fa-solid fa-circle-info"></i> Pipeline Trace Map`;
    detailsSubtitle.textContent = "Select any step to view deep logs";
    detailsContent.innerHTML = `
        <div class="welcome-details">
            <i class="fa-solid fa-arrow-up-long pulse-arrow"></i>
            <p>Select any step in the <strong>Pipeline Trace Map</strong> above to inspect dense/sparse data hits, Cross-Encoder weights, Query Expansion synonyms, NLI logic, or generation history.</p>
        </div>
    `;
}

// Update pipeline trace colors based on logs
function updatePipelineVisualization(telemetry) {
    const nodeInput = document.getElementById("step-node-input");
    const nodeRetrieval = document.getElementById("step-node-retrieval");
    const nodeRerank = document.getElementById("step-node-rerank");
    const nodeExpansion = document.getElementById("step-node-expansion");
    const nodeGeneration = document.getElementById("step-node-generation");
    const nodeGuard = document.getElementById("step-node-guard");

    // 1. Input Node: Always successful
    nodeInput.classList.add("success");

    // 2. Retrieval Node: Warning if expansion triggered, success otherwise
    if (telemetry.query_expansion_triggered) {
        nodeRetrieval.classList.add("warning");
        nodeExpansion.classList.add("warning");
    } else {
        nodeRetrieval.classList.add("success");
        nodeExpansion.classList.add("success"); // expansion skipped (green)
    }

    // 3. Re-rank Node: Always success if retrieved chunks successfully
    nodeRerank.classList.add("success");

    // 4. Generation & Guard Node
    const blockedCount = telemetry.hallucination_blocked_count;
    if (blockedCount > 0) {
        nodeGeneration.classList.add("warning");
        nodeGuard.classList.add("danger"); // flagged hallucination
    } else {
        nodeGeneration.classList.add("success");
        nodeGuard.classList.add("success"); // entailment verified
    }
    
    // Automatically select the Guard step to show NLI logs first (best practice)
    nodeGuard.click();
}

// Show Step Details inside the details subpanel
function showStepDetails(stepName) {
    if (!currentTelemetry) return;

    let title = "";
    let subtitle = "";
    let html = "";

    switch(stepName) {
        case "input":
            title = "Input Query Validation";
            subtitle = "Ingested user prompt character validation";
            
            const wasExpanded = currentTelemetry.query_expansion_triggered;
            
            html = `
                <div class="detail-item-box">
                    <h4>Original Prompt</h4>
                    <p style="font-style: italic; background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius:6px; border: 1px solid rgba(255,255,255,0.05);">
                        "${currentTelemetry.original_query}"
                    </p>
                </div>
                <div class="detail-item-box">
                    <h4>Character Count</h4>
                    <p>Total letters: <strong>${currentTelemetry.original_query.length} chars</strong></p>
                </div>
                <div class="detail-item-box">
                    <h4>Query State</h4>
                    <p>Was expanded: <span class="badge ${wasExpanded ? 'badge-warning' : 'badge-success'}" style="padding:2px 8px; font-size: 0.65rem;">${wasExpanded ? 'YES' : 'NO'}</span></p>
                    ${wasExpanded ? `<p style="margin-top: 0.5rem;">Final search query: <strong>"${currentTelemetry.final_query}"</strong></p>` : ''}
                </div>
            `;
            break;

        case "retrieval":
            title = "Two-Stage Hybrid Retrieval";
            subtitle = "FAISS Dense Search & BM25 Sparse Search outputs";
            
            const finalAttemptIdx = currentTelemetry.retrieval_attempts.length - 1;
            const finalAttempt = currentTelemetry.retrieval_attempts[finalAttemptIdx];
            
            html = `
                <div class="detail-item-box">
                    <h4>Index Hits (Final Search Attempt)</h4>
                    <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                        <div style="flex:1; background:rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); padding: 0.5rem; border-radius: 6px; text-align:center;">
                            <span style="display:block; font-size:1.25rem; font-weight:700; color:var(--accent-purple);">${finalAttempt.dense_hits}</span>
                            <span style="font-size:0.65rem; color:var(--text-secondary);">Dense hits (FAISS)</span>
                        </div>
                        <div style="flex:1; background:rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); padding: 0.5rem; border-radius: 6px; text-align:center;">
                            <span style="display:block; font-size:1.25rem; font-weight:700; color:var(--accent-blue);">${finalAttempt.sparse_hits}</span>
                            <span style="font-size:0.65rem; color:var(--text-secondary);">Sparse hits (BM25)</span>
                        </div>
                    </div>
                </div>
                
                <div class="detail-item-box">
                    <h4>Merged Candidates (${finalAttempt.total_candidates} deduplicated chunks)</h4>
                    <p style="font-size: 0.75rem; margin-bottom: 0.5rem;">Both retrieval stages were merged and unique documents kept to form the candidates stack.</p>
                </div>
            `;
            break;

        case "rerank":
            title = "Cross-Encoder Re-ranking";
            subtitle = "ms-marco-MiniLM-L-6-v2 dynamic relevance scoring";
            
            const lastRetAttempt = currentTelemetry.retrieval_attempts[currentTelemetry.retrieval_attempts.length - 1];
            const top5 = lastRetAttempt.chunks;
            
            let tableRows = "";
            top5.forEach((item, index) => {
                const scoreClass = item.cross_score >= parseFloat(paramRelevance.value) ? "score-high" : "score-low";
                
                // Truncate text for table
                const textTrunc = item.text.length > 90 ? item.text.substring(0, 90) + "..." : item.text;
                
                tableRows += `
                    <tr>
                        <td><strong>#${index + 1}</strong></td>
                        <td title="${item.text}">${textTrunc}</td>
                        <td><span class="score-badge ${scoreClass}">${item.cross_score.toFixed(3)}</span></td>
                    </tr>
                `;
            });

            html = `
                <div class="detail-item-box">
                    <h4>Top 5 Re-ranked Context Chunks</h4>
                    <p style="font-size: 0.75rem; margin-bottom: 0.5rem; line-height:1.4;">
                        Cross-Encoder evaluates deep relationships between query and document text. Relevance threshold is set to <strong>${parseFloat(paramRelevance.value).toFixed(2)}</strong>.
                    </p>
                    <table class="telemetry-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Chunk Text Preview</th>
                                <th>Relevance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            `;
            break;

        case "expansion":
            title = "Self-Corrective Loop / Query Expansion";
            subtitle = "Thesaurus and generative synonym query expansion";
            
            const expCount = currentTelemetry.retrieval_attempts.length - 1;
            
            if (expCount === 0) {
                html = `
                    <div class="detail-item-box" style="border-color: rgba(16, 185, 129, 0.15); background: rgba(16, 185, 129, 0.02)">
                        <h4 style="color: var(--accent-green)"><i class="fa-solid fa-circle-check"></i> Expansion Skipped</h4>
                        <p>The top candidate's re-ranking score (<strong>${currentTelemetry.retrieval_attempts[0].top_score.toFixed(3)}</strong>) was above the threshold of <strong>${parseFloat(paramRelevance.value).toFixed(2)}</strong>. Retrieval was marked as relevant, skipping query expansion.</p>
                    </div>
                `;
            } else {
                let attemptsHtml = "";
                currentTelemetry.retrieval_attempts.forEach((att, idx) => {
                    attemptsHtml += `
                        <div style="border-left: 2px solid ${idx === currentTelemetry.retrieval_attempts.length - 1 ? 'var(--accent-green)' : 'var(--accent-orange)'}; padding-left: 0.75rem; margin-bottom: 1rem;">
                            <span style="font-size: 0.7rem; color:var(--text-secondary); text-transform: uppercase; font-weight:600;">Attempt #${idx}: ${att.status.toUpperCase()}</span>
                            <p style="font-size: 0.8rem; margin: 2px 0;">Query used: <strong>"${att.query}"</strong></p>
                            <p style="font-size: 0.75rem; color:var(--text-muted);">Top relevance score: <strong style="color: ${att.status === 'relevant' ? 'var(--accent-green)' : 'var(--accent-orange)'}">${att.top_score.toFixed(3)}</strong></p>
                        </div>
                    `;
                });

                html = `
                    <div class="detail-item-box" style="border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.02)">
                        <h4 style="color: var(--accent-orange)"><i class="fa-solid fa-arrows-split-up-and-left"></i> Loop Triggered</h4>
                        <p style="margin-bottom: 0.75rem;">Initial query score was below threshold. Query expansion was run to broaden search vocabulary.</p>
                        ${attemptsHtml}
                    </div>
                `;
            }
            break;

        case "generation":
            title = "Local LLM Response Drafts";
            subtitle = "Factual answer draft generation attempts";
            
            let genAttemptsHtml = "";
            currentTelemetry.generation_attempts.forEach((gen, idx) => {
                const statusClass = gen.status === "verified" ? "badge-success" : "badge-danger";
                
                genAttemptsHtml += `
                    <div class="detail-item-box">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem;">
                            <h4 style="font-size: 0.8rem; margin:0;">Draft #${idx + 1} (Temp: ${gen.temperature})</h4>
                            <span class="badge ${statusClass}">${gen.status}</span>
                        </div>
                        <p style="font-size:0.75rem; background: rgba(0,0,0,0.2); padding:0.6rem; border-radius:4px; font-family: monospace; line-height: 1.4; color: var(--text-primary);">
                            ${gen.response_draft}
                        </p>
                    </div>
                `;
            });

            html = `
                <div class="nli-charts-container" style="margin-top: 0; gap: 1rem;">
                    ${genAttemptsHtml}
                </div>
            `;
            break;

        case "guard":
            title = "NLI Hallucination Guard";
            subtitle = "Natural Language Inference premise verification";
            
            const lastGenAttemptIdx = currentTelemetry.generation_attempts.length - 1;
            const lastGenAttempt = currentTelemetry.generation_attempts[lastGenAttemptIdx];
            const nliScores = lastGenAttempt.nli_scores;
            
            // Format percentages
            const entPercent = (nliScores.entailment * 100).toFixed(1);
            const conPercent = (nliScores.contradiction * 100).toFixed(1);
            const neuPercent = (nliScores.neutral * 100).toFixed(1);
            
            html = `
                <div class="detail-item-box" style="margin-bottom:1rem;">
                    <h4>Entailment Verification Metrics</h4>
                    <p style="font-size: 0.75rem; color:var(--text-secondary); line-height:1.4;">
                        Verifies if the response statement is strictly supported by the retrieved context. If Entailment score falls below <strong>${parseFloat(paramNli.value).toFixed(2)}</strong>, it is flagged as a hallucination.
                    </p>
                    
                    <div class="nli-charts-container">
                        <!-- Entailment -->
                        <div class="nli-bar-group">
                            <div class="nli-bar-label">
                                <span><i class="fa-solid fa-circle-check" style="color:var(--accent-green)"></i> Entailment (Factual Support)</span>
                                <strong>${entPercent}%</strong>
                            </div>
                            <div class="nli-bar-bg">
                                <div class="nli-bar-fill" style="width: ${entPercent}%; background-color: var(--accent-green)"></div>
                            </div>
                        </div>

                        <!-- Neutral -->
                        <div class="nli-bar-group">
                            <div class="nli-bar-label">
                                <span><i class="fa-solid fa-circle-question" style="color:var(--accent-orange)"></i> Neutral (External Facts)</span>
                                <strong>${neuPercent}%</strong>
                            </div>
                            <div class="nli-bar-bg">
                                <div class="nli-bar-fill" style="width: ${neuPercent}%; background-color: var(--accent-orange)"></div>
                            </div>
                        </div>

                        <!-- Contradiction -->
                        <div class="nli-bar-group">
                            <div class="nli-bar-label">
                                <span><i class="fa-solid fa-circle-exclamation" style="color:var(--accent-red)"></i> Contradiction (Hallucinations)</span>
                                <strong>${conPercent}%</strong>
                            </div>
                            <div class="nli-bar-bg">
                                <div class="nli-bar-fill" style="width: ${conPercent}%; background-color: var(--accent-red)"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="detail-item-box" style="border-color: ${currentTelemetry.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; background: ${currentTelemetry.success ? 'rgba(16,185,129,0.015)' : 'rgba(239,68,68,0.015)'}">
                    <h4>Guard Status Result</h4>
                    <p>Blocked Hallucinations Count: <strong>${currentTelemetry.hallucination_blocked_count}</strong></p>
                    <p style="margin-top:0.4rem; font-size: 0.75rem; color:var(--text-secondary);">
                        ${currentTelemetry.success 
                          ? 'The final output passed verification audits successfully and was released to the user console.' 
                          : 'The pipeline hit the retry limit, blocking potential hallucinations and outputting a fallback safety response.'
                        }
                    </p>
                </div>
            `;
            break;
    }

    detailsTitle.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${title}`;
    detailsSubtitle.textContent = subtitle;
    detailsContent.innerHTML = html;
}
