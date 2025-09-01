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

const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket'] 
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); 
const upload = multer({ storage: multer.memoryStorage() });

// --- Database Connection Pattern ---
let conn = null;
const MONGO_URI = process.env.MONGO_URI;

const connectToDatabase = async () => {
  // FINAL DIAGNOSTIC LOG: This will show in your Netlify function logs.
  console.log("Function invoked. MONGO_URI value is:", MONGO_URI ? `set, starting with ${MONGO_URI.substring(0, 20)}...` : "!!! MONGO_URI IS NULL OR UNDEFINED !!!");

  if (conn == null) {
    console.log('Attempting to create new database connection...');
    try {
      conn = mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000 
      }).then(() => mongoose);
      await conn;
      console.log('✅✅✅ SUCCESS: New database connection established.');
    } catch (e) {
      console.error("❌❌❌ FATAL: Database connection failed during mongoose.connect()", e);
      conn = null;
      throw e;
    }
  } else {
      console.log('Reusing existing database connection.');
  }
  return conn;
};

// --- Schemas & Models ---
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

const leaderboardSchema = new mongoose.Schema({
    eventType: { type: String, required: true },
    details: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const Leaderboard = mongoose.models.Leaderboard || mongoose.model('Leaderboard', leaderboardSchema);


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
        console.error('CRASH in /api/login route:', error);
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
let shapeQuestState = {
    active: false,
    target: 'all',
    playerChoices: new Map(),
    startTime: null,
    duration: 30
};

let auctionState = {
    active: false,
    itemName: '',
    highBid: 0,
    highBidder: null
};

io.on('connection', (socket) => {
    console.log(`Socket connected via WebSocket: ${socket.id}`);

    if (shapeQuestState.active && shapeQuestState.startTime) {
        const elapsedTime = (Date.now() - shapeQuestState.startTime) / 1000;
        const remainingTime = shapeQuestState.duration - elapsedTime;
        if (remainingTime > 0) {
            socket.emit('event:shapeQuestSync', {
                target: shapeQuestState.target,
                remainingTime: Math.round(remainingTime)
            });
        }
    }

    if (auctionState.active) {
        socket.emit('event:auctionSync', {
            itemName: auctionState.itemName,
            highBid: auctionState.highBid
        });
    }

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

    socket.on('admin:startShapeQuest', (data) => {
        shapeQuestState.active = true;
        shapeQuestState.target = data.target || 'all';
        shapeQuestState.playerChoices.clear();
        shapeQuestState.startTime = Date.now();
        io.emit('event:shapeQuestStarted', { target: shapeQuestState.target });
        console.log(`Shape Quest started for: ${shapeQuestState.target}`);
    });

    socket.on('student:shapeSelected', (data) => {
        if (shapeQuestState.active) {
            shapeQuestState.playerChoices.set(data.sapId, data.shape);
        }
    });

    socket.on('admin:eliminateShape', async (data) => {
        if (!shapeQuestState.active) return;
        const losingShape = data.shape;
        const filter = { isEliminated: false, role: 'student' };
        if (shapeQuestState.target === 'boys') filter.isGirl = false;
        else if (shapeQuestState.target === 'girls') filter.isGirl = true;
        await connectToDatabase();
        const targetPlayers = await User.find(filter, 'sapId assignedNumber');
        const playersToEliminate = new Set();
        for (const player of targetPlayers) {
            const choice = shapeQuestState.playerChoices.get(player.sapId);
            if (choice === losingShape || !choice) {
                playersToEliminate.add(player.assignedNumber);
            }
        }
        const eliminatedNumbers = Array.from(playersToEliminate);
        if (eliminatedNumbers.length > 0) {
            await User.updateMany(
                { assignedNumber: { $in: eliminatedNumbers } },
                { $set: { isEliminated: true } }
            );
            io.emit('event:playersEliminated', { numbers: eliminatedNumbers });
        }
        
        // Log to leaderboard
        const leaderboardEntry = new Leaderboard({
            eventType: 'Shape Quest Elimination',
            details: `Shape: ${losingShape}. Players Eliminated: ${eliminatedNumbers.length}.`
        });
        await leaderboardEntry.save();

        shapeQuestState.active = false;
        shapeQuestState.startTime = null;
    });

    socket.on('admin:eliminateByNumber', async (data) => { const numbers = data.numbers.map(n => parseInt(n)).filter(n => !isNaN(n)); if (numbers.length > 0) { await connectToDatabase(); await User.updateMany( { assignedNumber: { $in: numbers } }, { $set: { isEliminated: true } } ); io.emit('event:playersEliminated', { numbers }); } });
    socket.on('admin:resetAllEliminations', async () => { try { await connectToDatabase(); await User.updateMany({ role: 'student' }, { $set: { isEliminated: false } }); io.emit('event:allPlayersReset'); } catch (error) { console.error('Error resetting eliminations:', error); } });
    socket.on('admin:unEliminatePlayer', async (data) => { const { sapId } = data; if (!sapId) return; try { await connectToDatabase(); const updatedUser = await User.findOneAndUpdate( { sapId }, { $set: { isEliminated: false } }, { new: true } ); if (updatedUser) io.emit('event:playerUnEliminated', { sapId: updatedUser.sapId }); } catch (error) { console.error('Error un-eliminating player:', error); } });
    socket.on('admin:updateCoins', async (data) => { const { sapId, changeAmount } = data; if (!sapId || isNaN(changeAmount)) return; try { await connectToDatabase(); const updatedUser = await User.findOneAndUpdate({ sapId }, { $inc: { coins: parseInt(changeAmount) } }, { new: true }); if (updatedUser) io.emit('event:coinsUpdated', { sapId, newBalance: updatedUser.coins }); } catch (error) { console.error('Error updating coins in database:', error); } });
    
    socket.on('admin:startAuction', (data) => {
        auctionState = {
            active: true,
            itemName: data.itemName,
            highBid: 0,
            highBidder: null
        };
        io.emit('event:auctionStarted', data);
    });

    socket.on('student:placeBid', (data) => {
        if (auctionState.active && data.bidAmount > auctionState.highBid) {
            auctionState.highBid = data.bidAmount;
            auctionState.highBidder = data;
            io.emit('event:newBid', data);
        }
    });

    socket.on('admin:endAuction', async (data) => {
        const { winnerSapId, itemName, finalBid } = data;
        if (!winnerSapId || !itemName || isNaN(finalBid)) return console.error('Invalid data for auction end:', data);
        try {
            await connectToDatabase();
            const winner = await User.findOne({ sapId: winnerSapId });
            const updatedUser = await User.findOneAndUpdate(
                { sapId: winnerSapId },
                { $inc: { coins: -finalBid }, $push: { wonItems: { name: itemName, winningBid: finalBid } } },
                { new: true }
            );

            // Log to leaderboard
            const leaderboardEntry = new Leaderboard({
                eventType: 'Auction Winner',
                details: `Player ${winner.name} (${winnerSapId}) won ${itemName} for ${finalBid} SquidBits.`
            });
            await leaderboardEntry.save();

            if (updatedUser) {
                io.emit('event:auctionEnded', { winnerSapId, itemName, finalBid });
                io.emit('event:coinsUpdated', { sapId: updatedUser.sapId, newBalance: updatedUser.coins });
            }
        } catch (error) {
            console.error('Error processing auction winner:', error);
        }
        auctionState = { active: false, itemName: '', highBid: 0, highBidder: null };
    });

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
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
