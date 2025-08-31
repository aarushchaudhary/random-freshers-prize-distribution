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
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); 
const upload = multer({ storage: multer.memoryStorage() });

// --- SERVERLESS DATABASE CONNECTION PATTERN ---
let conn = null;
const MONGO_URI = process.env.MONGO_URI;

const connectToDatabase = async () => {
  if (conn == null) {
    console.log('Creating new database connection...');
    conn = mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000 
    }).then(() => mongoose);

    // `await` the connection promise to ensure it's established
    await conn;
    console.log('✅ New database connection established.');
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
// Ensure the model is not re-compiled if it already exists
const User = mongoose.models.User || mongoose.model('User', userSchema);

// --- API Endpoints ---
const router = express.Router();

router.post('/login', async (req, res) => {
    console.log("Netlify Function is using URI:", process.env.MONGO_URI); 
    try {
        await connectToDatabase(); 
        console.log('Login attempt after DB connection.');
        
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
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

router.get('/users', async (req, res) => { 
    try { 
        await connectToDatabase();
        const users = await User.find({ role: 'student' }).sort({ assignedNumber: 1 }); 
        res.json({ success: true, users }); 
    } catch (error) { 
        console.error('Error fetching users:', error);
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

// --- Game State ---
let shapeQuestState = { active: false, target: 'all', playerChoices: new Map() };

// --- Real-Time Logic with Socket.IO ---
io.on('connection', (socket) => {
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
        } catch (error) {
            console.error('Authentication error:', error);
        }
    });

    socket.on('admin:startShapeQuest', (data) => { shapeQuestState.active = true; shapeQuestState.target = data.target || 'all'; shapeQuestState.playerChoices.clear(); io.emit('event:shapeQuestStarted', { target: shapeQuestState.target }); console.log(`Shape Quest started for: ${shapeQuestState.target}`); });
    socket.on('student:shapeSelected', (data) => { if (shapeQuestState.active) { shapeQuestState.playerChoices.set(data.sapId, data.shape); } });
    socket.on('admin:eliminateShape', async (data) => { if (!shapeQuestState.active) return; const losingShape = data.shape; const filter = { isEliminated: false, role: 'student' }; if (shapeQuestState.target === 'boys') filter.isGirl = false; else if (shapeQuestState.target === 'girls') filter.isGirl = true; await connectToDatabase(); const targetPlayers = await User.find(filter, 'sapId assignedNumber'); const playersToEliminate = new Set(); for (const player of targetPlayers) { const choice = shapeQuestState.playerChoices.get(player.sapId); if (choice === losingShape || !choice) { playersToEliminate.add(player.assignedNumber); } } const eliminatedNumbers = Array.from(playersToEliminate); if (eliminatedNumbers.length > 0) { await User.updateMany( { assignedNumber: { $in: eliminatedNumbers } }, { $set: { isEliminated: true } } ); io.emit('event:playersEliminated', { numbers: eliminatedNumbers }); } shapeQuestState.active = false; });
    socket.on('admin:eliminateByNumber', async (data) => { const numbers = data.numbers.map(n => parseInt(n)).filter(n => !isNaN(n)); if (numbers.length > 0) { await connectToDatabase(); await User.updateMany( { assignedNumber: { $in: numbers } }, { $set: { isEliminated: true } } ); io.emit('event:playersEliminated', { numbers }); } });
    socket.on('admin:resetAllEliminations', async () => { try { await connectToDatabase(); await User.updateMany({ role: 'student' }, { $set: { isEliminated: false } }); io.emit('event:allPlayersReset'); } catch (error) { console.error('Error resetting eliminations:', error); } });
    socket.on('admin:unEliminatePlayer', async (data) => { const { sapId } = data; if (!sapId) return; try { await connectToDatabase(); const updatedUser = await User.findOneAndUpdate( { sapId }, { $set: { isEliminated: false } }, { new: true } ); if (updatedUser) io.emit('event:playerUnEliminated', { sapId: updatedUser.sapId }); } catch (error) { console.error('Error un-eliminating player:', error); } });
    socket.on('admin:updateCoins', async (data) => { const { sapId, changeAmount } = data; if (!sapId || isNaN(changeAmount)) return; try { await connectToDatabase(); const updatedUser = await User.findOneAndUpdate({ sapId }, { $inc: { coins: parseInt(changeAmount) } }, { new: true }); if (updatedUser) io.emit('event:coinsUpdated', { sapId, newBalance: updatedUser.coins }); } catch (error) { console.error('Error updating coins in database:', error); } });
    socket.on('admin:endAuction', async (data) => { const { winnerSapId, itemName, finalBid } = data; if (!winnerSapId || !itemName || isNaN(finalBid)) return console.error('Invalid data for auction end:', data); try { await connectToDatabase(); const updatedUser = await User.findOneAndUpdate( { sapId: winnerSapId }, { $inc: { coins: -finalBid }, $push: { wonItems: { name: itemName, winningBid: finalBid } } }, { new: true } ); if (updatedUser) { io.emit('event:auctionEnded', { winnerSapId, itemName, finalBid }); io.emit('event:coinsUpdated', { sapId: updatedUser.sapId, newBalance: updatedUser.coins }); } } catch (error) { console.error('Error processing auction winner:', error); } });
    socket.on('admin:startAuction', (data) => io.emit('event:auctionStarted', data));
    socket.on('student:placeBid', (data) => io.emit('event:newBid', data));

    socket.on('disconnect', async () => {
        try {
            await connectToDatabase();
            await User.findOneAndUpdate({ socketId: socket.id }, { socketId: null });
            console.log(`Socket disconnected: ${socket.id}`);
        } catch (error) {
            console.error('Error on disconnect:', error);
        }
    });
});

// --- Serverless Export for Netlify ---
module.exports.handler = serverless(app);

// --- Local Server Start (for development) ---
// MODIFIED: This is now commented out for deployment.
/*
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
*/