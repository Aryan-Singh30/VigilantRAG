const axios = require('axios');

async function run() {
  try {
    console.log("1. Logging in...");
    const loginRes = await axios.post('http://localhost:5000/api/login', {
      email: 'premium@example.com',
      password: 'password123'
    });
    const token = loginRes.data.token;
    console.log("Token acquired:", token.substring(0, 20) + "...");

    console.log("\n2. Querying document details proxy (GET /api/documents/doc_aryan)...");
    try {
      const docRes = await axios.get('http://localhost:5000/api/documents/doc_aryan');
      console.log("Doc details status:", docRes.status);
      console.log("Doc keys returned:", Object.keys(docRes.data));
    } catch (e) {
      console.log("Failed to query document details:", e.message, e.response?.status, e.response?.data);
    }

    console.log("\n3. Fetching chat threads for project 'doc_aryan'...");
    try {
      const getRes = await axios.get('http://localhost:5000/api/projects/doc_aryan/chats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log("GET Chats status:", getRes.status);
      console.log("Chats count:", getRes.data.length);
    } catch (e) {
      console.log("Failed to get chats:", e.message, e.response?.status, e.response?.data);
    }

    console.log("\n4. Creating a new chat thread for project 'doc_aryan'...");
    try {
      const postRes = await axios.post('http://localhost:5000/api/projects/doc_aryan/chats', 
        { title: 'Test Thread' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log("POST Chat status:", postRes.status);
      console.log("POST Chat data:", postRes.data);
    } catch (e) {
      console.log("Failed to post chat:", e.message, e.response?.status, e.response?.data);
    }

  } catch (err) {
    console.error("Critical test error:", err.message);
  }
}

run();
