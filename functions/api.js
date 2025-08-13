// --- Dependencies ---
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const serverless = require('serverless-http');
const path = require('path');

// --- Initial Setup ---
const app = express();
const server = http.createServer(app);
app.use(cors());
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Successfully connected to MongoDB Atlas.');
        // --- ADD THIS DEBUG LINE ---
        console.log(`✅ Connected to database: '${mongoose.connection.db.databaseName}'`);
    })
    .catch(err => console.error('Database connection error:', err));

// --- Mongoose Schema & Model ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sapId: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, default: 'student' },
    isGirl: { type: Boolean, default: false },
    assignedNumber: { type: Number, unique: true, sparse: true },
    coins: { type: Number, default: 1000 },
    isEliminated: { type: Boolean, default: false },
    wonItems: [{ name: String, winningBid: Number }]
});

const User = mongoose.model('User', userSchema);

// --- API Endpoints ---
const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { sapId, password } = req.body;
        console.log(`Backend received login attempt for SAP ID: '${sapId}'`);
        const user = await User.findOne({ sapId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
        if (user.role === 'student' && user.isEliminated) {
            return res.status(403).json({ success: false, message: 'You have been eliminated.' });
        }
        res.json({ success: true, user });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

router.get('/users', async (req, res) => {
    try {
        const users = await User.find({ role: 'student' }).sort({ assignedNumber: 1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Could not fetch users.' });
    }
});

// =================================================================
//                 *** NEW TEST ROUTE ADDED HERE ***
// =================================================================
router.get('/testfind', async (req, res) => {
    const testSapId = "70572400153";
    console.log(`--- RUNNING HARDCODED TEST for SAP ID: '${testSapId}' ---`);
    try {
        const user = await User.findOne({ sapId: testSapId });
        if (user) {
            console.log("--- TEST SUCCEEDED: User was found! ---");
            res.json({ success: true, message: "Test user found.", user });
        } else {
            console.log("--- TEST FAILED: User was NOT found with hardcoded ID. ---");
            res.status(404).json({ success: false, message: "Test user NOT found." });
        }
    } catch (error) {
        console.log("--- TEST ERROR ---", error);
        res.status(500).json({ success: false, message: "Error during test." });
    }
});
// =================================================================

app.use('/api', router);

// --- Real-Time Logic with Socket.IO ---
io.on('connection', (socket) => {
    // ... socket logic remains the same
});

// --- Local Server Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});