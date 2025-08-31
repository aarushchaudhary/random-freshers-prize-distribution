// --- Dependencies ---
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const serverless = require('serverless-http');

// --- Initial Setup & Middleware ---
const app = express();
const server = http.createServer(app);
app.use(cors());

// --- CRITICAL SOCKET.IO FIX for "Session ID unknown" ---
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] },
    // This helps Socket.IO work in certain serverless environments
    allowEIO3: true 
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); 
const upload = multer({ storage: multer.memoryStorage() });

// --- SERVERLESS DATABASE CONNECTION PATTERN with better logging ---
let conn = null;
const MONGO_URI = process.env.MONGO_URI;

const connectToDatabase = async () => {
  // This log will tell us if the environment variable is missing in Netlify
  console.log("Attempting to connect. MONGO_URI is set:", !!MONGO_URI);

  if (conn == null) {
    console.log('Creating new database connection...');
    try {
      conn = mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000 
      }).then(() => mongoose);

      await conn;
      console.log('✅ New database connection established.');
    } catch (e) {
      // This will log the specific database error to your Netlify function logs
      console.error("FATAL: Database connection failed:", e);
      conn = null; // Reset connection on failure
      throw e; // Ensure the error propagates
    }
  } else {
    console.log('Reusing existing database connection.');
  }
  return conn;
};

// --- Schema & Model Definition ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sapId: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, default: 'student' },
    isGirl: { type: Boolean, default: false },
    assignedNumber: { type: Number, unique: true, sparse: true },
    coins: { type: Number, default: 1000 },
    isEliminated: { type: Boolean, default: false },
    wonItems: [{ name: String, winningBid: Number }],
    sessionToken: { type: String },
    socketId: { type: String }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// --- API Endpoints ---
const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        await connectToDatabase(); 
        const { sapId, password } = req.body;
        const user = await User.findOne({ sapId });

        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        if (user.role === 'student' && user.isEliminated) return res.status(403).json({ success: false, message: 'You have been eliminated.' });

        if (user.socketId) {
            io.to(user.socketId).emit('forceDisconnect');
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        user.sessionToken = sessionToken;
        user.socketId = null;
        await user.save();
        
        res.json({ success: true, user, token: sessionToken });
    } catch (error) {
        console.error('Error during login route execution:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

router.get('/users', async (req, res) => { 
    try { 
        await connectToDatabase();
        const users = await User.find({ role: 'student' }).sort({ assignedNumber: 1 }); 
        res.json({ success: true, users }); 
    } catch (error) { 
        res.status(500).json({ success: false, message: 'Could not fetch users.' }); 
    } 
});

router.post('/upload-students', upload.single('csvFile'), async (req, res) => { 
    if (!req.file) { return res.status(400).json({ message: 'No file uploaded.' }); } 
    const newUsers = []; 
    const stream = Readable.from(req.file.buffer); 
    try { 
        await connectToDatabase();
        const existingUsers = await User.find({}, 'assignedNumber sapId'); 
        const existingNumbers = new Set(existingUsers.map(u => u.assignedNumber)); 
        const existingSapIds = new Set(existingUsers.map(u => u.sapId)); 
        const parser = stream.pipe(csv({ headers: ['name', 'sapId', 'password', 'gender'] })); 
        for await (const row of parser) { 
            if (!row.name || !row.sapId || !row.password || !row.gender) continue; 
            if (existingSapIds.has(row.sapId)) continue; 
            const salt = await bcrypt.genSalt(10); 
            const hashedPassword = await bcrypt.hash(row.password, salt); 
            let assignedNumber; 
            do { 
                assignedNumber = Math.floor(Math.random() * 350) + 1; 
            } while (existingNumbers.has(assignedNumber)); 
            existingNumbers.add(assignedNumber); 
            newUsers.push({ name: row.name, sapId: row.sapId, password: hashedPassword, isGirl: row.gender.toLowerCase() === 'girl', assignedNumber: assignedNumber, }); 
        } 
        if (newUsers.length > 0) { 
            await User.insertMany(newUsers); 
        } 
        res.status(200).json({ message: `Successfully registered ${newUsers.length} new students.` }); 
    } catch (error) { 
        console.error('Error processing CSV:', error); 
        res.status(500).json({ message: 'Failed to process CSV file.' }); 
    } 
});

app.use('/api', router);

// --- Game State & Socket.IO Logic ---
let shapeQuestState = { active: false, target: 'all', playerChoices: new Map() };

io.on('connection', (socket) => {
    // All your socket event handlers go here...
    console.log(`Socket connected: ${socket.id}`);
    socket.on('authenticate', async (data) => {
        try {
            await connectToDatabase();
            const user = await User.findOne({ sapId: data.sapId, sessionToken: data.token });
            if (user) {
                user.socketId = socket.id;
                await user.save();
                console.log(`Socket ${socket.id} authenticated for user ${user.sapId}`);
            } else {
                socket.emit('forceDisconnect');
            }
        } catch (error) { console.error('Authentication error:', error); }
    });
    
    // ... all other socket logic ...

    socket.on('disconnect', async () => {
        try {
            await connectToDatabase();
            await User.findOneAndUpdate({ socketId: socket.id }, { socketId: null });
            console.log(`Socket disconnected: ${socket.id}`);
        } catch (error) { console.error('Error on disconnect:', error); }
    });
});

// --- Serverless Export ---
module.exports.handler = serverless(server);

// --- Local Server Start (for development) ---
// MODIFIED: This is now commented out for deployment.
/*
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
*/