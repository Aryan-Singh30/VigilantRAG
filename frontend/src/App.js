import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Sparkles, AlertTriangle, CheckCircle, Shield, 
  Database, Zap, ArrowRight, RefreshCw, Star, Info, Lock, Check, LogOut, Mail, Key, Upload, FileText,
  MessageSquare, Trash2, Library, ChevronRight, Activity, FilePlus, Edit2, Copy, User, Eye, EyeOff
} from 'lucide-react';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Auth view mode ('login' or 'register')
  const [authMode, setAuthMode] = useState('login');
  
  // Registration States
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regAvatar, setRegAvatar] = useState('👨‍💻');
  const [regError, setRegError] = useState('');
  
  // Password Visibility States
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  
  // Navigation Sidebar
  const [activeTab, setActiveTab] = useState('workspace'); // 'workspace', 'library', 'telemetry'
  
  // RAG States
  const [documents, setDocuments] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [queryAllDocs, setQueryAllDocs] = useState(false);
  const [activeTelemetry, setActiveTelemetry] = useState(null);
  
  // Chat Threads States
  const [chatThreads, setChatThreads] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  
  // User Profile details
  const [userStatus, setUserStatus] = useState({ 
    isPremium: false, 
    name: '',
    queryCount: 0,
    totalStorageBytes: 0,
    uploadedDocuments: []
  });

  // Library Viewer & File Upload & Copy Paste States
  const [selectedDocContent, setSelectedDocContent] = useState(null);
  const [viewingDocId, setViewingDocId] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [copyPasteText, setCopyPasteText] = useState('');
  const [ingestMode, setIngestMode] = useState('upload'); // 'upload', 'copypaste'
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ type: '', text: '' });
  const [copiedId, setCopiedId] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  
  // Razorpay Simulation Overlay States
  const [showRzpModal, setShowRzpModal] = useState(false);
  const [rzpOrderDetails, setRzpOrderDetails] = useState(null);
  const [rzpPaymentStep, setRzpPaymentStep] = useState('methods'); // 'methods', 'card', 'upi', 'processing'
  const [rzpCardNumber, setRzpCardNumber] = useState('');
  const [rzpCardExpiry, setRzpCardExpiry] = useState('');
  const [rzpCardCvv, setRzpCardCvv] = useState('');
  const [rzpUpiId, setRzpUpiId] = useState('');
  const [rzpActiveOptions, setRzpActiveOptions] = useState(null);

  // Account Settings States
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('👨‍💻');
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState({ type: '', text: '' });

  const messagesEndRef = useRef(null);

  // Initialize and load datasets
  useEffect(() => {
    if (token) {
      fetchUserStatus();
      fetchDocuments();
    }
  }, [token]);

  // Synchronize profile states with loaded user details
  useEffect(() => {
    if (userStatus) {
      setProfileName(userStatus.name || '');
      setProfileEmail(userStatus.email || '');
      setProfilePhone(userStatus.phoneNumber || '');
      setProfilePhoto(userStatus.profilePhoto || '👨‍💻');
    }
  }, [userStatus]);

  // Dynamically load Razorpay SDK script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Load chat threads when project (document) changes
  useEffect(() => {
    if (token && selectedProjectId) {
      fetchChatThreads(selectedProjectId);
    } else {
      setChatThreads([]);
      setActiveChatId('');
      setMessages([]);
    }
  }, [selectedProjectId, token]);

  // Load message history when active chat thread changes
  useEffect(() => {
    if (activeChatId) {
      const activeThread = chatThreads.find(t => t.chatId === activeChatId);
      if (activeThread) {
        setMessages(activeThread.messages || []);
        const lastAiMsg = [...(activeThread.messages || [])].reverse().find(m => m.sender === 'ai');
        if (lastAiMsg && lastAiMsg.telemetry) {
          setActiveTelemetry(lastAiMsg.telemetry);
        }
      }
    } else {
      setMessages([]);
    }
  }, [activeChatId, chatThreads]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      alert("🎉 Thank you! Your account has been upgraded to Premium.");
      window.history.replaceState({}, document.title, "/");
      if (token) fetchUserStatus();
    } else if (params.get('payment') === 'cancel') {
      alert("❌ Payment was cancelled. Feel free to upgrade anytime!");
      window.history.replaceState({}, document.title, "/");
    }
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopyToClipboard = (text, msgIdx) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgIdx);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const renderFormattedMessage = (text) => {
    if (!text) return null;
    
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      parts.push({ type: 'code', content: match[1] });
      lastIndex = codeBlockRegex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }
    
    return parts.map((part, idx) => {
      if (part.type === 'code') {
        return (
          <pre key={idx} className="formatted-code-block">
            <code>{part.content.trim()}</code>
          </pre>
        );
      } else {
        const lines = part.content.split('\n');
        return lines.map((line, lineIdx) => {
          const isListItem = line.trim().startsWith('- ') || line.trim().startsWith('* ');
          const content = line.replace(/^[\s*-]+/, '');
          
          const formatBold = (str) => {
            const boldRegex = /\*\*([\s\S]*?)\*\*/g;
            const boldParts = [];
            let bLastIndex = 0;
            let bMatch;
            while ((bMatch = boldRegex.exec(str)) !== null) {
              if (bMatch.index > bLastIndex) {
                boldParts.push(str.substring(bLastIndex, bMatch.index));
              }
              boldParts.push(<strong key={bMatch.index}>{bMatch[1]}</strong>);
              bLastIndex = boldRegex.lastIndex;
            }
            if (bLastIndex < str.length) {
              boldParts.push(str.substring(bLastIndex));
            }
            return boldParts.length > 0 ? boldParts : str;
          };
          
          if (isListItem) {
            return (
              <li key={lineIdx} className="formatted-list-item">
                {formatBold(content)}
              </li>
            );
          } else {
            return (
              <p key={lineIdx} className="formatted-paragraph">
                {formatBold(line)}
              </p>
            );
          }
        });
      }
    });
  };

  const handleLogin = async (e, devEmail = null) => {
    if (e) e.preventDefault();
    setLoginError('');
    const targetEmail = devEmail || email;
    const targetPassword = devEmail ? 'password123' : password;
    try {
      const res = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setEmail('');
      setPassword('');
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: 'Empty', color: '#718096' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score += 1;
    
    if (score === 1) return { score: 33, label: 'Weak', color: '#ef4444' };
    if (score === 2) return { score: 66, label: 'Medium', color: '#f59e0b' };
    if (score === 3) return { score: 100, label: 'Strong', color: '#22c55e' };
    return { score: 0, label: 'Empty', color: '#718096' };
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    
    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match!");
      return;
    }

    const strength = getPasswordStrength(regPassword);
    if (strength.label === 'Weak' || regPassword.length < 6) {
      setRegError("Password must be at least 6 characters, contain a number, and a special character.");
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          name: regName,
          profilePhoto: regAvatar
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setRegEmail('');
      setRegPassword('');
      setRegConfirmPassword('');
      setRegName('');
      setAuthMode('login');
    } catch (err) {
      setRegError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUserStatus({ isPremium: false, name: '', queryCount: 0, totalStorageBytes: 0, uploadedDocuments: [] });
    setActiveTelemetry(null);
    setDocuments([]);
    setSelectedProjectId('');
    setChatThreads([]);
    setActiveChatId('');
    setMessages([]);
  };

  const fetchUserStatus = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/user-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) handleLogout();
      else setUserStatus(data);
    } catch (err) { console.error("Failed to connect to Gateway server."); }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocuments(data);
        if (data.length > 0 && !selectedProjectId) setSelectedProjectId(data[0].id);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      console.error("Failed to fetch documents list.");
      setDocuments([]);
    }
  };

  const fetchChatThreads = async (projId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projId}/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setChatThreads(data);
      if (data.length > 0) setActiveChatId(data[0].chatId);
      else handleCreateChatThread(projId, "General Discussion");
    } catch (err) { console.error("Failed to load chat threads."); }
  };

  const handleCreateChatThread = async (projId, threadTitle) => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projId}/chats`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: threadTitle })
      });
      const newThread = await res.json();
      setChatThreads(prev => [...prev, newThread]);
      setActiveChatId(newThread.chatId);
    } catch (err) { console.error("Failed to create new chat thread."); }
  };

  const handleDeleteChatThread = async (e, threadId) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:5000/api/projects/${selectedProjectId}/chats/${threadId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setChatThreads(prev => prev.filter(t => t.chatId !== threadId));
      if (activeChatId === threadId) setActiveChatId('');
    } catch (err) { console.error("Failed to delete chat thread."); }
  };

  const handleRenameChatThread = async (e, threadId, currentTitle) => {
    e.stopPropagation();
    const titleInput = prompt("Rename conversation thread to:", currentTitle);
    if (titleInput === null) return;
    const newTitle = titleInput.trim() || currentTitle;
    if (newTitle === currentTitle) return;

    try {
      const res = await fetch(`http://localhost:5000/api/projects/${selectedProjectId}/chats/${threadId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle })
      });
      const data = await res.json();
      if (res.ok) {
        setChatThreads(prev => prev.map(t => t.chatId === threadId ? { ...t, chatTitle: data.chatTitle } : t));
      }
    } catch (err) {
      console.error("Failed to rename thread.");
    }
  };

  const handleDeleteDocument = async (e, docId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this document from the database? This will permanently wipe its text vectors and conversation history.")) return;

    try {
      const res = await fetch(`http://localhost:5000/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert("🗑️ Document deleted successfully!");
        if (viewingDocId === docId) {
          setSelectedDocContent(null);
          setViewingDocId('');
        }
        if (selectedProjectId === docId) {
          setSelectedProjectId('');
        }
        fetchDocuments();
        fetchUserStatus();
      } else {
        alert(`Error: ${data.error || "Failed to delete document"}`);
      }
    } catch (err) {
      alert("Failed to connect to Gateway server during deletion.");
    }
  };

  const handleExportChat = () => {
    if (messages.length === 0) {
      alert("No messages to export!");
      return;
    }
    
    let mdContent = `# Chat Export - ${documents.find(d => d.id === selectedProjectId)?.title || "Workspace"}\n`;
    mdContent += `Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
    
    messages.forEach(msg => {
      const senderName = msg.sender === 'user' ? 'User' : 'AI Assistant';
      mdContent += `### 💬 ${senderName}\n${msg.text}\n\n`;
      if (msg.telemetry) {
        mdContent += `*Audit Trace: Execution Speed: ${msg.telemetry.execution_time_sec?.toFixed(2)}s | NLI Fact-check: ${msg.telemetry.success ? 'PASSED' : 'BLOCKED'}*\n\n`;
      }
      mdContent += `---\n\n`;
    });
    
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chat_export_${selectedProjectId || 'session'}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || !activeChatId) return;
    const userMessage = { sender: 'user', text: query, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/query', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          query: userMessage.text,
          projectId: queryAllDocs ? 'all' : selectedProjectId,
          chatId: activeChatId
        })
      });
      const data = await response.json();
      if (response.status === 403 && data.is_blocked) {
        setMessages(prev => [...prev, { sender: 'ai', text: data.message, isBlocked: true, timestamp: new Date().toISOString() }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { sender: 'ai', text: `Error: ${data.error}`, timestamp: new Date().toISOString() }]);
      } else {
        const aiResponse = { sender: 'ai', text: data.answer, telemetry: data.telemetry, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, aiResponse]);
        setActiveTelemetry(data.telemetry);
        fetchUserStatus();
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: "Connection failed.", timestamp: new Date().toISOString() }]);
    } finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile || !uploadTitle.trim()) return;
    setUploadLoading(true);
    setUploadStatus({ type: '', text: '' });
    const docId = `doc_${uploadTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('doc_id', docId);
    formData.append('title', uploadTitle);
    try {
      const res = await fetch('http://localhost:5000/api/ingest-file', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to upload.");
      setUploadStatus({ type: 'success', text: `Success: "${uploadTitle}" indexed.` });
      setUploadTitle('');
      setSelectedFile(null);
      const fileInput = document.getElementById('device-file-input');
      if (fileInput) fileInput.value = '';
      fetchDocuments();
      fetchUserStatus();
    } catch (err) { setUploadStatus({ type: 'error', text: err.message }); }
    finally { setUploadLoading(false); }
  };

  const handleCopyPasteIngest = async (e) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !copyPasteText.trim()) return;
    setUploadLoading(true);
    setUploadStatus({ type: '', text: '' });
    const docId = `doc_${uploadTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    try {
      const res = await fetch('http://localhost:5000/api/ingest', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          doc_id: docId,
          title: uploadTitle,
          text: copyPasteText
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to index text.");
      setUploadStatus({ type: 'success', text: `Success: "${uploadTitle}" indexed.` });
      setUploadTitle('');
      setCopyPasteText('');
      fetchDocuments();
      fetchUserStatus();
    } catch (err) { setUploadStatus({ type: 'error', text: err.message }); }
    finally { setUploadLoading(false); }
  };

  const handleViewDocContent = async (docId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/documents/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.text) { setSelectedDocContent(data.text); setViewingDocId(docId); }
    } catch (err) { alert("Failed to load document text."); }
  };

  const handleUpgrade = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/create-razorpay-order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        }
      });
      const order = await res.json();
      if (res.status !== 200 || !order.id) {
        alert("Failed to create payment order: " + (order.error || "Gateway error"));
        return;
      }
      
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "VigilantRAG Premium",
        description: "Premium Plan Upgrade (Unlock Unlimited Document search, factuality guard)",
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await fetch("http://localhost:5000/api/verify-razorpay-payment", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                isMock: order.isMock
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok) {
              alert("🎉 Upgrade successful! Welcome to VigilantRAG Premium.");
              fetchUserStatus();
            } else {
              alert(`Verification failed: ${verifyData.error}`);
            }
          } catch (err) {
            alert("Payment verification connection error.");
          }
        },
        prefill: {
          name: userStatus.name || "Aryan",
          email: "user@example.com"
        },
        theme: {
          color: "#8b5cf6"
        }
      };
      
      if (order.isMock) {
        console.log("⚠️ Dev Mode: Initializing custom Razorpay overlay simulation.");
        setRzpOrderDetails(order);
        setRzpActiveOptions(options);
        setRzpPaymentStep('methods');
        setShowRzpModal(true);
        return;
      }

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        alert("Razorpay payment SDK failed to load. Please check your internet connection.");
      }
    } catch (err) {
      alert("Failed to initiate payment gateway.");
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaveLoading(true);
    setProfileSaveStatus({ type: '', text: '' });

    try {
      const res = await fetch('http://localhost:5000/api/user-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
          phoneNumber: profilePhone,
          profilePhoto: profilePhoto
        })
      });
      const data = await res.json();
      if (res.ok) {
        setProfileSaveStatus({ type: 'success', text: '🎉 Profile changes saved successfully!' });
        fetchUserStatus();
      } else {
        setProfileSaveStatus({ type: 'error', text: data.error || 'Failed to update profile details.' });
      }
    } catch (err) {
      setProfileSaveStatus({ type: 'error', text: 'Gateway server connection failure.' });
    } finally {
      setProfileSaveLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    const confirmCancel = window.confirm("Are you sure you want to cancel your Premium subscription? \n\nThis will downgrade your account to the Free Plan and lower your document limits.");
    if (!confirmCancel) return;

    try {
      const res = await fetch('http://localhost:5000/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        alert("🛡️ Subscription cancelled successfully. Account downgraded to Free.");
        fetchUserStatus();
      } else {
        alert("Subscription cancellation request failed.");
      }
    } catch (err) {
      alert("Billing server connection error.");
    }
  };

  if (!token) {
    return (
      <div className="login-screen-container">
        {authMode === 'login' ? (
          <div className="login-card">
            <div className="login-header">
              <Shield className="login-logo" />
              <h2>Welcome to VigilantRAG</h2>
              <p>Access your self-correcting RAG workspace</p>
            </div>
            
            <form onSubmit={(e) => handleLogin(e)} className="login-form">
              {loginError && <div className="error-alert">{loginError}</div>}
              <div className="input-group">
                <Mail className="input-icon" size={18} />
                <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <Key className="input-icon" size={18} />
                <input 
                  type={showLoginPassword ? "text" : "password"} 
                  className="pwd-input"
                  placeholder="Password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="submit" className="login-btn">Sign In</button>
            </form>

            <div className="auth-toggle-link">
              <span>Don't have an account? </span>
              <button onClick={() => setAuthMode('register')} className="toggle-btn-link">Create new account</button>
            </div>

            <div className="dev-login-section">
              <div className="dev-divider"><span>Sandbox Logins</span></div>
              <div className="dev-buttons">
                <button onClick={() => handleLogin(null, 'free@example.com')} className="dev-btn free">Free Plan</button>
                <button onClick={() => handleLogin(null, 'premium@example.com')} className="dev-btn premium">Premium Plan</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="login-card registration-card">
            <div className="login-header">
              <Shield className="login-logo" />
              <h2>Create Account</h2>
              <p>Sign up to start searching and verifying your documents</p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="login-form">
              {regError && <div className="error-alert">{regError}</div>}
              
              <div className="input-group">
                <User className="input-icon" size={18} />
                <input type="text" placeholder="Full Name" value={regName} onChange={(e) => setRegName(e.target.value)} required />
              </div>

              <div className="input-group">
                <Mail className="input-icon" size={18} />
                <input type="email" placeholder="Email Address" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
              </div>

              <div className="input-group">
                <Key className="input-icon" size={18} />
                <input 
                  type={showRegPassword ? "text" : "password"} 
                  className="pwd-input"
                  placeholder="Create Password" 
                  value={regPassword} 
                  onChange={(e) => setRegPassword(e.target.value)} 
                  required 
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  aria-label={showRegPassword ? "Hide password" : "Show password"}
                >
                  {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {regPassword && (
                <div className="pwd-strength-container">
                  <div className="pwd-strength-bar-bg">
                    <div 
                      className="pwd-strength-bar-fill" 
                      style={{ 
                        width: `${getPasswordStrength(regPassword).score}%`, 
                        backgroundColor: getPasswordStrength(regPassword).color 
                      }}
                    ></div>
                  </div>
                  <div className="pwd-strength-label" style={{ color: getPasswordStrength(regPassword).color }}>
                    Strength: <strong>{getPasswordStrength(regPassword).label}</strong>
                  </div>
                </div>
              )}

              <div className="input-group">
                <Check className="input-icon" size={18} />
                <input 
                  type={showRegConfirmPassword ? "text" : "password"} 
                  className="pwd-input"
                  placeholder="Confirm Password" 
                  value={regConfirmPassword} 
                  onChange={(e) => setRegConfirmPassword(e.target.value)} 
                  required 
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  aria-label={showRegConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showRegConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Onboarding Avatar Selector */}
              <div className="reg-avatar-section">
                <p className="avatar-select-label">Select Profile Avatar</p>
                <div className="avatar-chips-grid">
                  {['👨‍💻', '🚀', '🤖', '🕵️‍♂️', '👩‍💻', '🧬', '🧠', '🌟'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`avatar-chip-btn ${regAvatar === emoji ? 'selected' : ''}`}
                      onClick={() => setRegAvatar(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="login-btn" style={{ marginTop: '10px' }}>Create Account</button>
            </form>

            <div className="auth-toggle-link" style={{ marginBottom: '10px' }}>
              <span>Already have an account? </span>
              <button onClick={() => setAuthMode('login')} className="toggle-btn-link">Sign In</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="main-header">
        <div className="brand">
          <Shield className="logo-icon" />
          <h1>VigilantRAG <span className="badge">v2.0</span></h1>
        </div>
        <nav className="header-nav">
          <button className={`nav-tab-btn ${activeTab === 'workspace' ? 'active' : ''}`} onClick={() => setActiveTab('workspace')}><MessageSquare size={16} /> Workspace</button>
          <button className={`nav-tab-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}><Library size={16} /> Document DB</button>
          <button className={`nav-tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`} onClick={() => setActiveTab('telemetry')}><Activity size={16} /> AI Inspector</button>
          <button className={`nav-tab-btn ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}><User size={16} /> Account</button>
        </nav>
        <div className="user-section">
          {userStatus.isPremium ? <span className="premium-tag" onClick={() => setActiveTab('account')} style={{ cursor: 'pointer' }}><Star className="icon-star" /> Premium</span> : <button onClick={handleUpgrade} className="upgrade-btn"><Zap className="icon-zap" /> Upgrade</button>}
          <button 
            onClick={() => setActiveTab('account')} 
            className="header-avatar-btn" 
            title="Account Settings"
          >
            {userStatus.profilePhoto || '👨‍💻'}
          </button>
          <button onClick={handleLogout} className="logout-btn"><LogOut size={16} /></button>
        </div>
      </header>

      <div className="workspace">
        {activeTab === 'workspace' && (
          <>
            <div className="project-threads-sidebar">
              <div className="project-list-section">
                <div className="sidebar-search-wrapper" style={{ marginBottom: '10px' }}>
                  <input 
                    type="text" 
                    placeholder="Search projects..." 
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    className="sidebar-search-input"
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'white',
                      padding: '6px 10px',
                      fontSize: '0.8rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <h3>Projects</h3>
                <div className="project-items">
                  {documents.filter(doc => doc.title.toLowerCase().includes(docSearchQuery.toLowerCase())).map(doc => (
                    <button key={doc.id} className={`project-item-btn ${selectedProjectId === doc.id ? 'active' : ''}`} onClick={() => { setSelectedProjectId(doc.id); setQueryAllDocs(false); }}>
                      <FileText size={14} /> <span className="truncate" style={{ flex: 1 }}>{doc.title}</span>
                    </button>
                  ))}
                  {documents.length === 0 && (
                    <p className="empty-text" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '10px 0' }}>No projects found.</p>
                  )}
                </div>
              </div>
              {selectedProjectId && (
                <div className="threads-list-section">
                  <div className="section-header">
                    <h3>Conversations</h3>
                    <button 
                      onClick={() => {
                        const suggested = `Thread #${chatThreads.length + 1}`;
                        const titleInput = prompt("Enter a name for your new conversation thread:", suggested);
                        if (titleInput === null) return;
                        const threadTitle = titleInput.trim() || "New Thread";
                        handleCreateChatThread(selectedProjectId, threadTitle);
                      }} 
                      className="new-thread-btn"
                      title="Add New Thread"
                    >
                      <FilePlus size={14} /> New
                    </button>
                  </div>
                  {chatThreads.map(thread => (
                    <button key={thread.chatId} className={`thread-item-btn ${activeChatId === thread.chatId ? 'active' : ''}`} onClick={() => setActiveChatId(thread.chatId)}>
                      <span className="truncate">{thread.chatTitle}</span>
                      <div className="thread-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Edit2 
                          size={12} 
                          className="rename-thread-icon" 
                          onClick={(e) => handleRenameChatThread(e, thread.chatId, thread.chatTitle)}
                          title="Rename Thread"
                        />
                        <Trash2 
                          size={12} 
                          className="delete-thread-icon" 
                          onClick={(e) => handleDeleteChatThread(e, thread.chatId)}
                          title="Delete Thread"
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="chat-container">
              <div className="doc-selector-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {userStatus.isPremium ? (
                  <label className="checkbox-label">
                    <input type="checkbox" checked={queryAllDocs} onChange={(e) => setQueryAllDocs(e.target.checked)} /> 
                    <span>🔍 Enable Multi-Doc Search (Cross-Document Query)</span>
                  </label>
                ) : <span>Single Doc Mode</span>}
                
                {messages.length > 0 && (
                  <button 
                    onClick={handleExportChat} 
                    className="telemetry-trigger-btn"
                    style={{ margin: 0, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    📥 Export Chat (.md)
                  </button>
                )}
              </div>
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="chat-welcome-container">
                    <Shield className="welcome-logo" size={48} />
                    <h2>VigilantRAG Active Workspace</h2>
                    <p>Ask anything about your document project. The AI will search, analyze, and fact-check its answers automatically.</p>
                    
                    <div className="suggestion-chips-grid">
                      <button className="suggestion-chip" onClick={() => setQuery("Summarize the key takeaways of this document.")}>
                        📝 Summarize key takeaways
                      </button>
                      <button className="suggestion-chip" onClick={() => setQuery("Are there any security or policy guidelines mentioned?")}>
                        🔒 Locate policy guidelines
                      </button>
                      <button className="suggestion-chip" onClick={() => setQuery("Give me a comprehensive bullet point breakdown.")}>
                        💡 Get bullet point breakdown
                      </button>
                      <button className="suggestion-chip" onClick={() => setQuery("Verify if there are any contradictions in this data.")}>
                        🛡️ Perform compliance audit
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className={`message-bubble ${msg.sender}`}>
                      <div className="bubble-content">
                        {msg.sender === 'ai' ? renderFormattedMessage(msg.text) : <p>{msg.text}</p>}
                        
                        {msg.sender === 'ai' && (
                          <div className="message-actions-wrapper" style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                            {msg.telemetry && (
                              <button onClick={() => { setActiveTelemetry(msg.telemetry); setActiveTab('telemetry'); }} className="telemetry-trigger-btn" style={{ margin: 0 }}>
                                <Activity size={12} /> Inspect AI Logic
                              </button>
                            )}
                            <button onClick={() => handleCopyToClipboard(msg.text, i)} className="copy-message-btn">
                              {copiedId === i ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                              <span>{copiedId === i ? "Copied!" : "Copy"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {loading && (
                  <div className="message-bubble ai loading">
                    <div className="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSendQuery} className="chat-input-form">
                <input 
                  type="text" 
                  value={query} 
                  onChange={(e) => setQuery(e.target.value)} 
                  placeholder={activeChatId ? "Type your query here..." : "Select a document project thread to chat..."}
                  disabled={!activeChatId} 
                  className="chat-input"
                />
                <button type="submit" disabled={!activeChatId || loading} className="send-btn">
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}

        {activeTab === 'library' && (
          <div className="library-container">
            <div className="library-sidebar">
              <div className="section-header" style={{ marginBottom: '12px' }}>
                <h3>Ingested Documents</h3>
                <button 
                  onClick={() => {
                    setSelectedDocContent(null);
                    setViewingDocId('');
                    setUploadStatus({ type: '', text: '' });
                  }} 
                  className="new-thread-btn"
                  title="Add New Document"
                >
                  <FilePlus size={14} /> Add New
                </button>
              </div>
              
              <div className="sidebar-search-wrapper" style={{ marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="Search database..." 
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                  className="sidebar-search-input"
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'white',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div className="library-items" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.filter(doc => doc.title.toLowerCase().includes(docSearchQuery.toLowerCase())).map(doc => (
                  <div key={doc.id} className="library-item-wrapper" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                    <button 
                      className={`library-item-btn ${viewingDocId === doc.id ? 'active' : ''}`}
                      onClick={() => handleViewDocContent(doc.id)}
                      style={{ flex: 1 }}
                    >
                      <div className="doc-info">
                        <span className="doc-title">{doc.title}</span>
                        <span className="doc-meta">
                          {(doc.text_length / 1024).toFixed(1)} KB | {doc.chunks_count} chunks
                        </span>
                      </div>
                      <ChevronRight size={16} className="item-arrow" />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteDocument(e, doc.id)} 
                      className="delete-doc-btn"
                      title="Delete Document"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: 'var(--accent-red)',
                        padding: '12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {documents.length === 0 && (
                  <p className="empty-text" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No documents found.</p>
                )}
              </div>
            </div>
            
            <div className="library-viewer-panel">
              {selectedDocContent ? (
                <div className="doc-text-viewer">
                  <div className="viewer-header">
                    <h3>Document Text: <strong>{documents.find(d => d.id === viewingDocId)?.title}</strong></h3>
                    <button 
                      onClick={() => {
                        setSelectedDocContent(null);
                        setViewingDocId('');
                        setUploadStatus({ type: '', text: '' });
                      }} 
                      className="close-viewer-btn"
                    >
                      ← Back & Add Document
                    </button>
                  </div>
                  <div className="viewer-body">
                    <pre>{selectedDocContent}</pre>
                  </div>
                </div>
              ) : (
                <div className="file-uploader-card">
                  <div className="upload-header-desc">
                    <h2>Indexed Document Sandbox</h2>
                    <p>Index documents directly from your device, or copy-paste raw text contents. They will be partitioned into semantic chunks and embedded instantly.</p>
                  </div>

                  <div className="ingest-tabs">
                    <button 
                      className={`ingest-tab-btn ${ingestMode === 'upload' ? 'active' : ''}`}
                      onClick={() => setIngestMode('upload')}
                    >
                      <Upload size={14} /> Upload Device File
                    </button>
                    <button 
                      className={`ingest-tab-btn ${ingestMode === 'copypaste' ? 'active' : ''}`}
                      onClick={() => setIngestMode('copypaste')}
                    >
                      <FileText size={14} /> Copy-Paste Raw Text
                    </button>
                  </div>

                  {uploadStatus.text && (
                    <div className={`ingest-status-alert ${uploadStatus.type}`}>
                      {uploadStatus.text}
                    </div>
                  )}

                  {ingestMode === 'upload' ? (
                    <form onSubmit={handleFileUpload} className="library-upload-form">
                      <div className="form-group">
                        <label>Document Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Employee Travel Guidelines"
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Select Document File (.pdf, .docx, .xlsx, .txt)</label>
                        <div className="file-picker-wrapper">
                          <Upload className="picker-icon" size={28} />
                          <input 
                            id="device-file-input"
                            type="file"
                            accept=".pdf,.docx,.doc,.xlsx,.xls,.txt"
                            onChange={(e) => {
                              setSelectedFile(e.target.files[0]);
                              if (e.target.files[0] && !uploadTitle) {
                                const nameWithoutExt = e.target.files[0].name.replace(/\.[^/.]+$/, "");
                                setUploadTitle(nameWithoutExt.replace(/_/g, ' '));
                              }
                            }}
                            required
                          />
                          {selectedFile ? (
                            <span className="selected-filename">Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          ) : (
                            <span className="placeholder-filename">Drag & drop your file here, or click to browse files</span>
                          )}
                        </div>
                      </div>

                      <button type="submit" disabled={uploadLoading} className="submit-upload-btn">
                        {uploadLoading ? (
                          <span className="flex-align"><RefreshCw className="animate-spin" size={16} /> Parsing & Indexing...</span>
                        ) : (
                          <span className="flex-align"><Upload size={16} /> Index Document File</span>
                        )}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleCopyPasteIngest} className="library-upload-form">
                      <div className="form-group">
                        <label>Document Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Leave Policy Addendum"
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Paste Document Contents</label>
                        <textarea 
                          rows={8}
                          placeholder="Paste raw text content here to index..."
                          value={copyPasteText}
                          onChange={(e) => setCopyPasteText(e.target.value)}
                          required
                        />
                      </div>

                      <button type="submit" disabled={uploadLoading} className="submit-upload-btn">
                        {uploadLoading ? (
                          <span className="flex-align"><RefreshCw className="animate-spin" size={16} /> Embedding Chunks...</span>
                        ) : (
                          <span className="flex-align"><FileText size={16} /> Index Raw Text Document</span>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="telemetry-dashboard-container">
            <div className="telemetry-header-panel">
              <Activity className="telemetry-header-icon" />
              <div>
                <h2>AI Answer Inspector</h2>
                <p>Check how the AI analyzed your files and fact-checked its own response to prevent errors.</p>
              </div>
            </div>

            {activeTelemetry ? (
              <div className="telemetry-dashboard-grid">
                
                {/* 1. Response Speed Card */}
                <div className="telemetry-grid-card border-blue">
                  <h3>Response Speed</h3>
                  <div className="big-stat-val text-blue">
                    {activeTelemetry.execution_time_sec?.toFixed(2) || '0.24'}s
                  </div>
                  <span className="badge-friendly badge-blue">⚡ Fast Response</span>
                  <p className="stat-desc">The time taken by the AI to search your files and construct this answer.</p>
                </div>

                {/* 2. Documents Scanned Card */}
                <div className="telemetry-grid-card border-green">
                  <h3>Passages Read</h3>
                  <div className="big-stat-val text-green">
                    {activeTelemetry.retrieved_attempts?.[0]?.total_candidates || 0}
                  </div>
                  <span className="badge-friendly badge-green">🔍 Sources Scanned</span>
                  <p className="stat-desc">The number of matching paragraphs located in your document library for this search query.</p>
                </div>

                {/* 3. Accuracy Level Card */}
                <div className="telemetry-grid-card border-purple">
                  <h3>Semantic Match Accuracy</h3>
                  {activeTelemetry.use_reranking === false ? (
                    <div className="big-stat-val text-muted flex-align"><Lock size={22} /> Standard</div>
                  ) : (
                    <div className="big-stat-val text-purple">
                      {activeTelemetry.retrieved_attempts?.[0]?.top_score ? Math.round(activeTelemetry.retrieved_attempts[0].top_score * 100) : 0}%
                    </div>
                  )}
                  <span className="badge-friendly badge-purple">🎯 Understanding Level</span>
                  <p className="stat-desc">
                    {activeTelemetry.use_reranking === false ? (
                      "Upgrade to Premium to enable advanced semantic semantic re-ranking check."
                    ) : (
                      `The scanned paragraphs have a ${Math.round(activeTelemetry.retrieved_attempts?.[0]?.top_score * 100)}% match level to the meaning of your question.`
                    )}
                  </p>
                </div>

                {/* 4. Fact-Checking Card */}
                <div className="telemetry-grid-card border-orange">
                  <h3>Factual Verification</h3>
                  {activeTelemetry.use_nli_guard === false ? (
                    <div className="big-stat-val text-muted flex-align"><Lock size={22} /> Bypassed</div>
                  ) : (
                    <div className="big-stat-val text-orange" style={{ color: activeTelemetry.success ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {activeTelemetry.success ? 'PASSED' : 'BLOCKED'}
                    </div>
                  )}
                  <span className="badge-friendly badge-orange">🛡️ Hallucination Audit</span>
                  <p className="stat-desc">
                    {activeTelemetry.use_nli_guard === false ? (
                      "Upgrade to Premium to auto-audit response drafts against raw documents."
                    ) : (
                      activeTelemetry.success ? "Passed! The AI verified that the answer is 100% supported by the text in your files." : "Audit failed! A potential hallucination was blocked, and the AI was prompted to rewrite it."
                    )}
                  </p>
                </div>

                {/* Safety Check Logs */}
                {activeTelemetry.use_nli_guard !== false && activeTelemetry.generation_attempts?.length > 0 && (
                  <div className="telemetry-grid-full-width">
                    <h3>Draft Audit History (Step-by-Step AI Logic)</h3>
                    <div className="nli-scores-logs">
                      {activeTelemetry.generation_attempts.map((attempt, i) => (
                        <div key={i} className="nli-log-item">
                          <span className="log-attempt-badge">Draft Version #{attempt.attempt} (Audited)</span>
                          <div className="log-probs-wrapper" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="log-prob-bar-container">
                              <span className="prob-label">Supported by Documents: <strong>{Math.round(attempt.nli_scores?.entailment * 100)}%</strong></span>
                              <div className="progress-bar-bg"><div className="progress-bar-fill green" style={{ width: `${attempt.nli_scores?.entailment * 100}%` }}></div></div>
                            </div>
                            <div className="log-prob-bar-container">
                              <span className="prob-label" style={{ color: attempt.nli_scores?.contradiction > 0.15 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                                Contradicts / Made up by AI: <strong>{Math.round(attempt.nli_scores?.contradiction * 100)}%</strong>
                              </span>
                              <div className="progress-bar-bg"><div className="progress-bar-fill red" style={{ width: `${attempt.nli_scores?.contradiction * 100}%` }}></div></div>
                            </div>
                          </div>
                          <pre className="log-draft" style={{ marginTop: '12px' }}>Draft Response: "{attempt.response_draft}"</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="telemetry-placeholder-tab">
                <RefreshCw className="animate-spin placeholder-icon-tab" />
                <h3>No Query Inspected Yet</h3>
                <p>Run a search query in your Workspace, then click "Inspect AI Logic" to trace the fact-checking process.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'account' && (
          <div className="account-settings-container">
            <h2 className="section-title-account">Account Settings</h2>
            
            <div className="account-grid-layout">
              {/* Left Column: Profile edit form */}
              <div className="account-card profile-info-card">
                <h3>Personal Information</h3>
                
                {profileSaveStatus.text && (
                  <div className={`profile-status-alert ${profileSaveStatus.type}`}>
                    {profileSaveStatus.text}
                  </div>
                )}

                {/* Avatar Picker Section */}
                <div className="avatar-picker-section">
                  <div className="current-avatar-preview">
                    {profilePhoto}
                  </div>
                  <div className="avatar-selection-list">
                    <p className="avatar-select-label">Choose Avatar Emoji</p>
                    <div className="avatar-chips-grid">
                      {['👨‍💻', '🚀', '🤖', '🕵️‍♂️', '👩‍💻', '🧬', '🧠', '🌟'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={`avatar-chip-btn ${profilePhoto === emoji ? 'selected' : ''}`}
                          onClick={() => setProfilePhoto(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="profile-form">
                  <div className="form-group-acc">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="e.g. Amit Sharma"
                      required
                    />
                  </div>

                  <div className="form-group-acc">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="e.g. name@example.com"
                      required
                    />
                  </div>

                  <div className="form-group-acc">
                    <label>Phone Number</label>
                    <input 
                      type="text" 
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                    />
                  </div>

                  <button type="submit" disabled={profileSaveLoading} className="save-profile-btn">
                    {profileSaveLoading ? (
                      <span className="flex-align"><RefreshCw className="animate-spin" size={16} /> Saving...</span>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column: Billing Info & Usage stats */}
              <div className="account-card billing-info-card">
                <h3>Subscription & Billing</h3>
                
                <div className={`subscription-tier-banner ${userStatus.isPremium ? 'premium' : 'free'}`}>
                  <div className="tier-header">
                    <span className="tier-label">{userStatus.isPremium ? 'PREMIUM MEMBER' : 'FREE TIER'}</span>
                    <span className="tier-badge">{userStatus.isPremium ? '★ Pro' : 'Free'}</span>
                  </div>
                  <p className="tier-desc">
                    {userStatus.isPremium 
                      ? 'You have complete access to multi-document search and AI NLI hallucination check guards.'
                      : 'You are on the basic plan. Upload limits are capped at 3 documents.'
                    }
                  </p>
                  
                  {userStatus.isPremium ? (
                    <button onClick={handleCancelSubscription} className="cancel-sub-btn">
                      Cancel Subscription
                    </button>
                  ) : (
                    <button onClick={handleUpgrade} className="upgrade-sub-btn">
                      Upgrade to Premium ($10/mo)
                    </button>
                  )}
                </div>

                {userStatus.isPremium && userStatus.razorpayPaymentId && (
                  <div className="payment-metadata-box">
                    <h4>💳 Payment Details</h4>
                    <div className="metadata-row">
                      <span className="lbl">Provider</span>
                      <span className="val">Razorpay Sandbox</span>
                    </div>
                    <div className="metadata-row">
                      <span className="lbl">Payment ID</span>
                      <span className="val code">{userStatus.razorpayPaymentId}</span>
                    </div>
                    <div className="metadata-row">
                      <span className="lbl">Status</span>
                      <span className="val green">Success (Active)</span>
                    </div>
                  </div>
                )}

                {/* Storage & Limits */}
                <div className="usage-limits-box">
                  <h3>Limits & Resource Usage</h3>
                  
                  <div className="usage-progress-item">
                    <div className="usage-lbl-row">
                      <span>Documents Uploaded</span>
                      <strong>{userStatus.uploadedDocuments?.length || 0} / {userStatus.isPremium ? 100 : 3} files</strong>
                    </div>
                    <div className="usage-progress-bar-bg">
                      <div 
                        className="usage-progress-bar-fill fill-blue" 
                        style={{ width: `${Math.min(100, ((userStatus.uploadedDocuments?.length || 0) / (userStatus.isPremium ? 100 : 3)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="usage-progress-item" style={{ marginTop: '16px' }}>
                    <div className="usage-lbl-row">
                      <span>Cloud Storage Used</span>
                      <strong>{((userStatus.totalStorageBytes || 0) / (1024 * 1024)).toFixed(2)} MB / {userStatus.isPremium ? '5000' : '30'} MB</strong>
                    </div>
                    <div className="usage-progress-bar-bg">
                      <div 
                        className="usage-progress-bar-fill fill-purple" 
                        style={{ width: `${Math.min(100, ((userStatus.totalStorageBytes || 0) / ((userStatus.isPremium ? 5000 : 30) * 1024 * 1024)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {showRzpModal && rzpOrderDetails && (
          <div className="rzp-backdrop">
            <div className="rzp-modal-container">
              {/* Header */}
              <div className="rzp-modal-header">
                <div className="rzp-merchant-info">
                  <div className="rzp-avatar">V</div>
                  <div>
                    <h4>VigilantRAG</h4>
                    <p className="rzp-desc">{rzpActiveOptions?.description || "Premium Plan Upgrade"}</p>
                  </div>
                </div>
                <div className="rzp-amount-box">
                  <span className="rzp-amt">₹{rzpOrderDetails.amount / 100}.00</span>
                  <span className="rzp-currency">{rzpOrderDetails.currency}</span>
                </div>
              </div>

              {/* Sandbox Alert Banner */}
              <div className="rzp-sandbox-banner">
                <span>⚠️ TEST MODE (SANDBOX PAYMENTS)</span>
              </div>

              {/* Body */}
              <div className="rzp-modal-body">
                {rzpPaymentStep === 'methods' && (
                  <div className="rzp-methods-list">
                    <h5>SELECT PAYMENT OPTION</h5>
                    <button onClick={() => setRzpPaymentStep('card')} className="rzp-method-btn">
                      <span className="method-emoji">💳</span>
                      <div className="method-text">
                        <strong>Pay via Card</strong>
                        <p>Visa, Mastercard, RuPay, Maestro</p>
                      </div>
                      <ChevronRight size={14} className="method-arrow" />
                    </button>
                    <button onClick={() => setRzpPaymentStep('upi')} className="rzp-method-btn">
                      <span className="method-emoji">📱</span>
                      <div className="method-text">
                        <strong>UPI / QR Code</strong>
                        <p>Instant transfer via GPay, PhonePe, Paytm</p>
                      </div>
                      <ChevronRight size={14} className="method-arrow" />
                    </button>
                    <button 
                      onClick={() => {
                        setRzpPaymentStep('processing');
                        setTimeout(() => {
                          setRzpPaymentStep('success');
                          setTimeout(() => {
                            rzpActiveOptions.handler({
                              razorpay_order_id: rzpOrderDetails.id,
                              razorpay_payment_id: "pay_mock_" + Date.now(),
                              razorpay_signature: "mock_dev_signature"
                            });
                            setShowRzpModal(false);
                          }, 1500);
                        }, 1500);
                      }} 
                      className="rzp-method-btn"
                    >
                      <span>🏛️</span>
                      <div className="method-text">
                        <strong>Netbanking</strong>
                        <p>All major Indian banks available</p>
                      </div>
                      <ChevronRight size={14} className="method-arrow" />
                    </button>
                  </div>
                )}

                {rzpPaymentStep === 'card' && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      setRzpPaymentStep('processing');
                      setTimeout(() => {
                        setRzpPaymentStep('success');
                        setTimeout(() => {
                          rzpActiveOptions.handler({
                            razorpay_order_id: rzpOrderDetails.id,
                            razorpay_payment_id: "pay_mock_" + Date.now(),
                            razorpay_signature: "mock_dev_signature"
                          });
                          setShowRzpModal(false);
                        }, 1500);
                      }, 1500);
                    }} 
                    className="rzp-form"
                  >
                    {/* Visual Vector Card Preview */}
                    <div className="vector-card-preview">
                      <div className="vector-card-header">
                        <span className="card-logo-visa">VISA</span>
                        <div className="card-emv-chip"></div>
                      </div>
                      <div className="vector-card-number">
                        {rzpCardNumber || "•••• •••• •••• ••••"}
                      </div>
                      <div className="vector-card-footer">
                        <div>
                          <p className="card-lbl">HOLDER</p>
                          <p className="card-val">{rzpActiveOptions?.prefill?.name || "ARYAN DEVELOPER"}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p className="card-lbl">EXPIRES</p>
                          <p className="card-val">{rzpCardExpiry || "MM/YY"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rzp-form-group">
                      <input 
                        type="text" 
                        placeholder="Card Number" 
                        value={rzpCardNumber} 
                        onChange={(e) => setRzpCardNumber(e.target.value)}
                        required 
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        type="text" 
                        placeholder="MM/YY" 
                        value={rzpCardExpiry} 
                        onChange={(e) => setRzpCardExpiry(e.target.value)}
                        required 
                        style={{ flex: 1 }}
                      />
                      <input 
                        type="text" 
                        placeholder="CVV" 
                        value={rzpCardCvv} 
                        onChange={(e) => setRzpCardCvv(e.target.value)}
                        required 
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="button" onClick={() => setRzpPaymentStep('methods')} className="rzp-back-btn">Back</button>
                      <button type="submit" className="rzp-pay-btn">Pay ₹{rzpOrderDetails.amount / 100}</button>
                    </div>
                  </form>
                )}

                {rzpPaymentStep === 'upi' && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      setRzpPaymentStep('processing');
                      setTimeout(() => {
                        setRzpPaymentStep('success');
                        setTimeout(() => {
                          rzpActiveOptions.handler({
                            razorpay_order_id: rzpOrderDetails.id,
                            razorpay_payment_id: "pay_mock_" + Date.now(),
                            razorpay_signature: "mock_dev_signature"
                          });
                          setShowRzpModal(false);
                        }, 1500);
                      }, 1500);
                    }} 
                    className="rzp-form"
                  >
                    <div className="upi-logo-box">
                      <span>UPI</span>
                    </div>
                    <div className="rzp-form-group">
                      <input 
                        type="text" 
                        placeholder="username@upi" 
                        value={rzpUpiId} 
                        onChange={(e) => setRzpUpiId(e.target.value)}
                        required 
                      />
                    </div>
                    <p className="upi-info-text">You will receive a payment request on your UPI app.</p>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="button" onClick={() => setRzpPaymentStep('methods')} className="rzp-back-btn">Back</button>
                      <button type="submit" className="rzp-pay-btn">Verify & Pay</button>
                    </div>
                  </form>
                )}

                {rzpPaymentStep === 'processing' && (
                  <div className="rzp-processing-box">
                    <RefreshCw className="animate-spin text-blue-rzp" size={36} />
                    <h4>Processing Payment...</h4>
                    <p>Contacting banking networks securely. Please do not close or go back.</p>
                  </div>
                )}

                {rzpPaymentStep === 'success' && (
                  <div className="rzp-success-payment-box">
                    <div className="success-checkmark-glow">
                      <CheckCircle className="success-icon-animated" size={48} />
                    </div>
                    <h4>Payment Confirmed</h4>
                    <p>Upgrading your account to premium plan. Loading workspace...</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="rzp-modal-footer">
                <span className="rzp-lock-icon">🔒</span>
                <span>Secured by <strong>Razorpay</strong> test gateway</span>
                <button onClick={() => setShowRzpModal(false)} className="rzp-close-btn" title="Cancel Checkout">×</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;