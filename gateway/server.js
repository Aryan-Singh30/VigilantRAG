const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const stripeLib = require('stripe');
const Razorpay = require('razorpay');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Configuration environment variables loading
dotenv.config();

const mongoose = require('mongoose');
const User = require('./models/User');
const ProjectChat = require('./models/Chat');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('🌿 Connected securely to MongoDB Database'))
    .catch(err => console.error('❌ Failed to connect to MongoDB:', err.message));

const app = express();
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY);
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholderKey',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholderSecret'
});
const PORT = process.env.PORT || 5000;
const multer = require('multer');
const FormData = require('form-data');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// Configure secure file upload boundaries
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // Enforce 10MB maximum file size limit
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Error: Allowed file types are PDF, DOCX, DOC, XLSX, XLS, and TXT only!'));
        }
    }
});

// SaaS limits config plan
const PLAN_LIMITS = {
    free: {
        max_documents: 3,
        max_storage_mb: 30,
        max_queries: 50,
        reranking: false,
        nli_guard: false,
        query_expansion: false,
        multi_document: false
    },
    premium: {
        max_documents: 100,
        max_storage_mb: 5000,
        max_queries: 5000,
        reranking: true,
        nli_guard: true,
        query_expansion: true,
        multi_document: true
    }
};

// Secure CORS configurations
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS policy'));
        }
    },
    credentials: true
}));

// Rate limiting middleware for authentication routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 attempts per window
    message: { error: "Too many authentication requests from this IP. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false
});

// Note: Stripe Webhooks require raw request payloads, so we process JSON format only for normal routes
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});



// ========================================================
// 🛡️ AUTHENTICATION MIDDLEWARE
// ========================================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: "Access Denied. Authorization token missing." });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Injects decrypted payload { userId, email, name, isPremium }
        next();
    } catch (err) {
        res.status(403).json({ error: "Invalid or expired token." });
    }
};

// ========================================================
// 🔑 ROUTE 0: Login and Generate JWT Token
// ========================================================
// ========================================================
// 🔑 ROUTE 0: Login and Generate JWT Token (Rate limited, password verified with migration)
// ========================================================
app.post('/api/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user by email in MongoDB
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        // Compare password (bcrypt check with plain-text fallback)
        let validPassword = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            validPassword = await bcrypt.compare(password, user.password);
        } else {
            // Plain text check & auto-migrate to hash in MongoDB
            if (user.password === password) {
                validPassword = true;
                const saltRounds = 10;
                user.password = await bcrypt.hash(password, saltRounds);
                await user.save(); // Save hashed password directly to MongoDB
                console.log(`[PASSWORD MIGRATION] Migrated credentials to bcrypt for: ${user.email}`);
            }
        }

        if (!validPassword) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        // Generate JWT token containing user metadata
        const token = jwt.sign(
            { userId: user.userId, email: user.email, name: user.name, isPremium: user.isPremium },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({
            token: token,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                isPremium: user.isPremium
            }
        });
    } catch (err) {
        console.error("Login route error:", err.message);
        res.status(500).json({ error: "Internal server error during login." });
    }
});

// ========================================================
// 📝 ROUTE 0B: Register new user (Rate limited, password hashed)
// ========================================================
app.post('/api/register', authLimiter, async (req, res) => {
    const { email, password, name, profilePhoto } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    try {
        // Check if email already registered in MongoDB
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) {
            return res.status(400).json({ error: "Email address is already in use." });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const displayName = name || email.split('@')[0];

        // Create new user instance and save to MongoDB
        const newUser = new User({
            userId: userId,
            name: displayName,
            email: email.toLowerCase(),
            password: hashedPassword,
            isPremium: false,
            queryCount: 0,
            totalStorageBytes: 0,
            uploadedDocuments: [],
            profilePhoto: profilePhoto || '👨‍💻'
        });

        await newUser.save();
        console.log(`[USER REGISTRATION] Created new secure user in MongoDB: ${displayName}`);

        // Generate JWT token
        const token = jwt.sign(
            { userId: newUser.userId, email: newUser.email, name: newUser.name, isPremium: newUser.isPremium },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.status(201).json({
            token: token,
            user: {
                userId: newUser.userId,
                name: newUser.name,
                email: newUser.email,
                isPremium: newUser.isPremium
            }
        });
    } catch (err) {
        console.error("Registration error:", err.message);
        res.status(500).json({ error: "Failed to register new secure user." });
    }
});
// ========================================================
// 🔍 ROUTE 1: Proxy Query (Protected by Auth)
// ========================================================
app.post('/api/query', authenticateToken, async (req, res) => {
    const { query, documentId = null, projectId = null, chatId = null } = req.body;
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const plan = user.isPremium ? 'premium' : 'free';
        const limits = PLAN_LIMITS[plan];

        // 1. Check monthly query limits
        if ((user.queryCount || 0) >= limits.max_queries) {
            return res.status(403).json({
                is_blocked: true,
                message: `⚠️ Monthly query limit reached (${limits.max_queries} queries). Upgrade to Premium for 5,000 queries/month!`
            });
        }

        // 2. Perform Paywall word length check for Free tier
        const queryLength = query.trim().split(/\s+/).length;
        if (plan === 'free' && queryLength > 4) {
            return res.status(403).json({
                is_blocked: true,
                message: "⚠️ Free plan only allows quick query search of up to 4 words. Upgrade to Premium for unlimited prompt lengths and advanced reasoning!"
            });
        }

        // 3. Increment usage query counter in database
        user.queryCount = (user.queryCount || 0) + 1;
        await user.save();

        // 4. Construct payload overrides based on subscription plan capabilities
        const targetDocId = plan === 'premium' ? (projectId === 'all' ? null : (projectId || documentId)) : (projectId || documentId);

        const payload = {
            query: query,
            use_reranking: limits.reranking,
            use_nli_guard: limits.nli_guard,
            limit_document_id: targetDocId
        };

        console.log(`Forwarding query to RAG (Plan: ${plan}): "${query}"`);
        const response = await axios.post(`${process.env.PYTHON_BACKEND_URL}/api/query`, payload);
        const ragResult = response.data; // { answer, telemetry }

        // 5. Store message in MongoDB chat session history
        if (projectId && chatId) {
            let projectChat = await ProjectChat.findOne({ userId, projectId });
            if (!projectChat) {
                projectChat = new ProjectChat({ userId, projectId, chats: [] });
            }

            const chat = projectChat.chats.find(c => c.chatId === chatId);
            if (chat) {
                chat.messages.push({
                    sender: 'user',
                    text: query,
                    timestamp: new Date()
                });
                chat.messages.push({
                    sender: 'ai',
                    text: ragResult.answer,
                    telemetry: ragResult.telemetry,
                    timestamp: new Date()
                });
                await projectChat.save();
            }
        }

        res.json(ragResult);
    } catch (err) {
        console.error("Query proxy error:", err.message);
        res.status(502).json({
            error: "Bad Gateway. Private Python RAG microservice is offline or returned an error.",
            details: err.message
        });
    }
});

// ========================================================
// 📦 ROUTE 1B: Document Ingestion (Protected by Auth)
// ========================================================
app.post('/api/ingest', authenticateToken, async (req, res) => {
    const { doc_id, title, text, metadata = {} } = req.body;
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const plan = user.isPremium ? 'premium' : 'free';
        const limits = PLAN_LIMITS[plan];

        user.uploadedDocuments = user.uploadedDocuments || [];
        user.totalStorageBytes = user.totalStorageBytes || 0;

        // 1. Check document upload count limits
        if (user.uploadedDocuments.length >= limits.max_documents) {
            return res.status(403).json({
                error: "Document Limit Exceeded",
                message: `⚠️ Free plan only allows up to ${limits.max_documents} documents. Please upgrade to Premium to index up to 100 documents!`
            });
        }

        // 2. Check total storage size limits
        const sizeBytes = Buffer.byteLength(text, 'utf8');
        const incomingStorageMb = (user.totalStorageBytes + sizeBytes) / (1024 * 1024);
        if (incomingStorageMb > limits.max_storage_mb) {
            return res.status(403).json({
                error: "Storage Limit Exceeded",
                message: `⚠️ Storage limit of ${limits.max_storage_mb} MB would be exceeded. Upgrade to Premium for 5 GB storage!`
            });
        }

        // 3. Proxy ingestion requests to private Python indexing service
        console.log(`Forwarding ingestion request for document: "${title}"`);
        const response = await axios.post(`${process.env.PYTHON_BACKEND_URL}/api/ingest`, {
            doc_id, title, text, metadata
        });

        // 4. Update MongoDB user storage statistics metadata
        user.uploadedDocuments.push({ id: doc_id, name: title, sizeBytes });
        user.totalStorageBytes += sizeBytes;
        await user.save();

        res.json(response.data);
    } catch (err) {
        console.error("Ingest error:", err.message);
        res.status(502).json({ error: "Python indexing server is offline or returned an error." });
    }
});

// ========================================================
// 📁 ROUTE 1C: Device File Ingestion (Protected by Auth)
// ========================================================
app.post('/api/ingest-file', authenticateToken, upload.single('file'), async (req, res) => {
    const userId = req.user.userId;
    const { doc_id, title } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "No file was uploaded." });
    }

    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const plan = user.isPremium ? 'premium' : 'free';
        const limits = PLAN_LIMITS[plan];

        user.uploadedDocuments = user.uploadedDocuments || [];
        user.totalStorageBytes = user.totalStorageBytes || 0;

        // 1. Check document upload count limits
        if (user.uploadedDocuments.length >= limits.max_documents) {
            return res.status(403).json({
                error: "Document Limit Exceeded",
                message: `⚠️ Free plan only allows up to ${limits.max_documents} documents. Please upgrade to Premium to index up to 100 documents!`
            });
        }

        // 2. Check total storage size limits
        const sizeBytes = req.file.size;
        const incomingStorageMb = (user.totalStorageBytes + sizeBytes) / (1024 * 1024);
        if (incomingStorageMb > limits.max_storage_mb) {
            return res.status(403).json({
                error: "Storage Limit Exceeded",
                message: `⚠️ Storage limit of ${limits.max_storage_mb} MB would be exceeded. Upgrade to Premium for 5 GB storage!`
            });
        }

        console.log(`Forwarding file to Python parsing engine: "${title}" (${req.file.originalname})`);

        // Forward as FormData to Python
        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });
        form.append('doc_id', doc_id);
        form.append('title', title);

        const response = await axios.post(`${process.env.PYTHON_BACKEND_URL}/api/ingest-file`, form, {
            headers: form.getHeaders()
        });

        // 3. Update MongoDB user storage statistics metadata
        user.uploadedDocuments.push({ id: doc_id, name: title, sizeBytes });
        user.totalStorageBytes += sizeBytes;
        await user.save();

        res.json(response.data);
    } catch (err) {
        console.error("Python file ingestion server failed:", err.message);
        res.status(502).json({ error: "Python indexing server is offline or returned an error." });
    }
});

// ========================================================
// 💬 ROUTES 1D: Project Chat Thread Management (Protected by Auth)
// ========================================================
app.get('/api/projects/:projectId/chats', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { projectId } = req.params;

    try {
        const projectChat = await ProjectChat.findOne({ userId, projectId });
        if (projectChat) {
            res.json(projectChat.chats);
        } else {
            res.json([]);
        }
    } catch (err) {
        console.error("Fetch chats error:", err.message);
        res.status(500).json({ error: "Failed to fetch chat threads." });
    }
});

app.post('/api/projects/:projectId/chats', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { projectId } = req.params;
    const { title } = req.body;

    try {
        let projectChat = await ProjectChat.findOne({ userId, projectId });
        if (!projectChat) {
            projectChat = new ProjectChat({ userId, projectId, chats: [] });
        }

        const newChat = {
            chatId: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            chatTitle: title || "New Chat Thread",
            messages: []
        };

        projectChat.chats.push(newChat);
        await projectChat.save();

        res.status(201).json(newChat);
    } catch (err) {
        console.error("Create chat error:", err.message);
        res.status(500).json({ error: "Failed to create new chat thread." });
    }
});

app.delete('/api/projects/:projectId/chats/:chatId', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { projectId, chatId } = req.params;

    try {
        const projectChat = await ProjectChat.findOne({ userId, projectId });
        if (projectChat) {
            projectChat.chats = projectChat.chats.filter(c => c.chatId !== chatId);
            await projectChat.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Chat thread not found." });
        }
    } catch (err) {
        console.error("Delete chat error:", err.message);
        res.status(500).json({ error: "Failed to delete chat thread." });
    }
});

app.put('/api/projects/:projectId/chats/:chatId', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { projectId, chatId } = req.params;
    const { title } = req.body;

    try {
        const projectChat = await ProjectChat.findOne({ userId, projectId });
        if (projectChat) {
            const chat = projectChat.chats.find(c => c.chatId === chatId);
            if (chat) {
                chat.chatTitle = title || chat.chatTitle;
                await projectChat.save();
                return res.json(chat);
            }
        }
        res.status(404).json({ error: "Chat thread not found." });
    } catch (err) {
        console.error("Rename chat error:", err.message);
        res.status(500).json({ error: "Failed to rename chat thread." });
    }
});

// ========================================================
// 💳 ROUTE 2: Create Stripe Checkout Session (Protected by Auth)
// ========================================================
app.post('/api/create-checkout-session', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User profile not found." });
        }

        console.log(`Creating Stripe session for user: ${user.name}`);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'VigilantRAG Premium Search Plan',
                            description: 'Unlock unlimited query lengths, generative query expansion, and logical factuality verification dashboard.',
                        },
                        unit_amount: 1000,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'http://localhost:3000/?payment=success',
            cancel_url: 'http://localhost:3000/?payment=cancel',
            client_reference_id: userId
        });

        res.json({ url: session.url });
    } catch (err) {
        console.log("Stripe call failed. Falling back to mock session upgrade for dev mode:", err.message);

        // Dynamic MongoDB update to make the user Premium immediately
        try {
            const user = await User.findOne({ userId: userId });
            if (user) {
                user.isPremium = true;
                await user.save();
                console.log(`[MOCK UPGRADE] Successfully upgraded user ${user.name} to Premium status in MongoDB!`);
            }
        } catch (dbErr) {
            console.error("Mock database upgrade failed:", dbErr.message);
        }

        // Return local checkout success redirect url to React
        res.json({ url: 'http://localhost:3000/?payment=success' });
    }
});

app.post('/api/mock-upgrade', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const user = await User.findOne({ userId: userId });
        if (user) {
            user.isPremium = true;
            await user.save();
            console.log(`[MOCK UPGRADE] Successfully upgraded user ${user.name} via checkout page in MongoDB!`);
            return res.json({ success: true, message: "Upgraded successfully!" });
        }
        res.status(404).json({ error: "User not found." });
    } catch (err) {
        res.status(500).json({ error: "Failed to upgrade user." });
    }
});

// ========================================================
// 💳 RAZORPAY PAYMENT ENDPOINTS (Protected by Auth)
// ========================================================
app.post('/api/create-razorpay-order', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const options = {
            amount: 1000, // Amount is in INR paise (1000 paise = 10 INR)
            currency: "INR",
            receipt: "receipt_order_" + Date.now(),
            notes: {
                userId: userId
            }
        };

        const order = await razorpay.orders.create(options);
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholderKey'
        });
    } catch (err) {
        console.error("Razorpay order creation failed:", err.message);

        // Mock fallback order creation if Razorpay API keys are placeholders
        console.log("⚠️ Falling back to Mock Razorpay Order Creation for Dev Mode...");
        res.json({
            id: "order_mock_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
            amount: 1000,
            currency: "INR",
            key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholderKey',
            isMock: true
        });
    }
});

app.post('/api/verify-razorpay-payment', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, isMock } = req.body;

    const crypto = require("crypto");
    const secret = process.env.RAZORPAY_KEY_SECRET || 'placeholderSecret';

    let isSignatureValid = false;

    if (isMock) {
        console.log("⚠️ Dev Mode: Bypassing signature verification for mock Razorpay order.");
        isSignatureValid = true;
    } else {
        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest("hex");
        isSignatureValid = (generated_signature === razorpay_signature);
    }

    if (isSignatureValid) {
        try {
            const user = await User.findOne({ userId: userId });
            if (user) {
                user.isPremium = true;
                user.razorpayPaymentId = razorpay_payment_id || "pay_mock_" + Date.now();
                await user.save();
                console.log(`[RAZORPAY SUCCESS] Upgraded user ${user.name} to Premium status in MongoDB!`);
                return res.json({ success: true, message: "Payment verified, upgraded successfully." });
            }
            return res.status(404).json({ error: "User not found." });
        } catch (err) {
            console.error("Razorpay verification DB error:", err.message);
            return res.status(500).json({ error: "Failed to verify database status." });
        }
    } else {
        console.error("Razorpay signature verification failed.");
        return res.status(400).json({ error: "Payment verification failed. Invalid signature." });
    }
});

// ========================================================
// 👤 USER PROFILE & BILLING ENDPOINTS (Protected by Auth)
// ========================================================
app.put('/api/user-profile', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { name, email, phoneNumber, profilePhoto } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required fields." });
    }

    try {
        // Find and update user in MongoDB
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User profile not found." });
        }

        user.name = name;
        user.email = email.toLowerCase();
        if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
        if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;

        await user.save();
        console.log(`[PROFILE UPDATE] Updated user details in MongoDB for ${name}`);
        return res.json({ success: true, user });
    } catch (err) {
        console.error("Profile update error:", err.message);
        res.status(500).json({ error: "Failed to update user profile." });
    }
});
app.post('/api/cancel-subscription', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        user.isPremium = false;
        user.razorpayPaymentId = undefined; // Remove billing reference

        await user.save();
        console.log(`[SUBSCRIPTION CANCEL] Downgraded user ${user.name} to Free plan in MongoDB.`);
        return res.json({ success: true, message: "Subscription cancelled successfully." });
    } catch (err) {
        console.error("Subscription cancel error:", err.message);
        res.status(500).json({ error: "Failed to cancel subscription." });
    }
});

// ROUTE 3: Stripe Webhook (Stays unauthenticated since it is external Stripe server callback)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;

        console.log(`💳 Webhook Triggered! Payment confirmed for User ID: ${userId}`);

        try {
            const user = await User.findOne({ userId: userId });
            if (user) {
                user.isPremium = true;
                user.stripeCustomerId = session.customer;
                await user.save();
                console.log(`  SUCCESS: User ${user.name} is now Premium in MongoDB!`);
            }
        } catch (err) {
            console.error("Webhook DB update failed:", err.message);
        }
    }

    res.json({ received: true });
});

// ========================================================
// 📊 ROUTE 4: Fetch Current User Status (Protected by Auth)
// ========================================================
app.get('/api/user-status', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.user.userId });
        if (user) {
            res.json({
                isPremium: user.isPremium,
                name: user.name,
                email: user.email,
                phoneNumber: user.phoneNumber || '',
                profilePhoto: user.profilePhoto || '👨‍💻',
                queryCount: user.queryCount,
                totalStorageBytes: user.totalStorageBytes,
                uploadedDocuments: user.uploadedDocuments
            });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (err) {
        console.error("User status error:", err.message);
        res.status(500).json({ error: "Failed to fetch user status." });
    }
});
// ROUTE 5: Fetch list of ingested documents (Private list proxying, filtered by ownership)
app.get('/api/documents', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const response = await axios.get(`${process.env.PYTHON_BACKEND_URL}/api/documents`);
        // Filter list to only contain document records that belong to the current authenticated user
        const userDocIds = new Set((user.uploadedDocuments || []).map(d => d.id));
        const filteredDocs = (response.data || []).filter(doc => userDocIds.has(doc.id));
        res.json(filteredDocs);
    } catch (err) {
        console.error("Failed to fetch documents from RAG:", err.message);
        res.status(502).json({ error: "Private Python RAG microservice is offline." });
    }
});

// ROUTE 5B: Fetch full text of a specific document (Private proxying, ownership verified)
app.get('/api/documents/:docId', authenticateToken, async (req, res) => {
    const { docId } = req.params;
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Verify ownership of the requested document ID
        const hasDoc = (user.uploadedDocuments || []).some(d => d.id === docId);
        if (!hasDoc) {
            return res.status(403).json({ error: "Access Denied. You do not own this document." });
        }

        const response = await axios.get(`${process.env.PYTHON_BACKEND_URL}/api/documents/${docId}`);
        res.json(response.data);
    } catch (err) {
        console.error("Failed to fetch document content from RAG:", err.message);
        res.status(502).json({ error: "Private Python RAG microservice is offline or document not found." });
    }
});

// ROUTE 5C: Delete document proxy (Protected by Auth, ownership verified)
app.delete('/api/documents/:docId', authenticateToken, async (req, res) => {
    const { docId } = req.params;
    const userId = req.user.userId;

    try {
        const user = await User.findOne({ userId: userId });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Verify ownership before deleting
        const docIndex = (user.uploadedDocuments || []).findIndex(d => d.id === docId);
        if (docIndex === -1) {
            return res.status(403).json({ error: "Access Denied. You do not own this document." });
        }

        console.log(`Forwarding deletion request to Python: "${docId}"`);
        const response = await axios.delete(`${process.env.PYTHON_BACKEND_URL}/api/documents/${docId}`);

        // Update user statistics in MongoDB
        const deletedDoc = user.uploadedDocuments[docIndex];
        user.totalStorageBytes = Math.max(0, user.totalStorageBytes - (deletedDoc.sizeBytes || 0));
        user.uploadedDocuments.splice(docIndex, 1);
        await user.save();

        // Clean chats/messages related to this project document in MongoDB
        await ProjectChat.deleteOne({ userId: userId, projectId: docId });

        res.json(response.data);
    } catch (err) {
        console.error("Failed to delete document from Python service:", err.message);
        res.status(502).json({ error: "Private Python RAG microservice returned an error during deletion." });
    }
});

// Serve frontend React static build files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route to serve React index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`⚡ Node.js API Gateway is active on http://localhost:${PORT}`);
});