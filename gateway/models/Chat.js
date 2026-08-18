const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['user', 'ai'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    telemetry: { type: mongoose.Schema.Types.Mixed } // Multi-source metadata storage
});

const threadSchema = new mongoose.Schema({
    chatId: { type: String, required: true },
    chatTitle: { type: String, required: true },
    messages: [messageSchema]
});

const projectChatSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    projectId: { type: String, required: true }, // active document workspace ID
    chats: [threadSchema]
}, { timestamps: true });

// Dynamic indexes for fast lookups
projectChatSchema.index({ userId: 1, projectId: 1 }, { unique: true });

module.exports = mongoose.model('ProjectChat', projectChatSchema);