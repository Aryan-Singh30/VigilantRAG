const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const User = require('./models/User');
const ProjectChat = require('./models/Chat');

const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');

async function migrate() {
    if (!process.env.MONGODB_URI) {
        console.error("❌ MONGODB_URI not found in environment configurations.");
        process.exit(1);
    }

    console.log("🌿 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("🌿 Connected successfully.");

    // 1. Migrate Users
    if (fs.existsSync(USERS_FILE)) {
        try {
            const rawUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            console.log(`💼 Found ${rawUsers.length} users in users.json to migrate.`);
            
            for (const user of rawUsers) {
                const exists = await User.findOne({ userId: user.userId });
                if (!exists) {
                    // Create new user model (preserving old plain-text passwords or bcrypt hashes as-is)
                    await User.create(user);
                    console.log(`   ✅ Migrated user profile: ${user.name} (${user.email})`);
                } else {
                    console.log(`   ⏭️ User already exists in MongoDB: ${user.name} (${user.email})`);
                }
            }
        } catch (err) {
            console.error("❌ Failed migrating users:", err.message);
        }
    } else {
        console.log("⏭️ No users.json file found to migrate.");
    }

    // 2. Migrate Chats
    if (fs.existsSync(CHATS_FILE)) {
        try {
            const chatsDb = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
            let threadCount = 0;

            for (const userId of Object.keys(chatsDb)) {
                for (const projectId of Object.keys(chatsDb[userId])) {
                    const exists = await ProjectChat.findOne({ userId, projectId });
                    if (!exists) {
                        const projectData = chatsDb[userId][projectId];
                        await ProjectChat.create({
                            userId,
                            projectId,
                            chats: projectData.chats || []
                        });
                        threadCount += (projectData.chats || []).length;
                        console.log(`   ✅ Migrated project workspace chats for User: ${userId}, Project: ${projectId}`);
                    } else {
                        console.log(`   ⏭️ Project chat already exists in MongoDB for User: ${userId}, Project: ${projectId}`);
                    }
                }
            }
            console.log(`💼 Migrated total of ${threadCount} chat threads to MongoDB.`);
        } catch (err) {
            console.error("❌ Failed migrating chats:", err.message);
        }
    } else {
        console.log("⏭️ No chats.json file found to migrate.");
    }

    console.log("\n🎉 Migration completed successfully!");
    mongoose.connection.close();
}

migrate();
