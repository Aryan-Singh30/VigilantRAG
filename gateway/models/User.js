const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // bcrypt hashed passwords
    isPremium: { type: Boolean, default: false },
    queryCount: { type: Number, default: 0 },
    totalStorageBytes: { type: Number, default: 0 },
    uploadedDocuments: [documentSchema],
    profilePhoto: { type: String, default: '👨‍💻' },
    phoneNumber: { type: String, default: '' },
    razorpayPaymentId: { type: String },
    stripeCustomerId: { type: String }
}, { timestamps: true }); // Auto adds createdAt & updatedAt fields

module.exports = mongoose.model('User', userSchema);