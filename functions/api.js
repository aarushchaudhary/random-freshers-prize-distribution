// --- Dependencies ---
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

// --- Initial Setup & Middleware ---
const app = express();
const server = http.createServer(app);
app.use(cors());
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- Database Connection & Schema ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI).then(() => {
    console.log('✅ Successfully connected to MongoDB Atlas.');
    console.log(`✅ Connected to database: '${mongoose.connection.db.databaseName}'`);
}).catch(err => console.error('Database connection error:', err));

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
        const user = await User.findOne({ sapId });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        if (user.role === 'student' && user.isEliminated) return res.status(403).json({ success: false, message: 'You have been eliminated.' });
        res.json({ success: true, user });
    } catch (error) {
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
app.use('/api', router);

// --- Real-Time Logic with Socket.IO ---
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('admin:eliminateByNumber', async (data) => {
        const numbers = data.numbers.map(n => parseInt(n)).filter(n => !isNaN(n));
        await User.updateMany({ assignedNumber: { $in: numbers } }, { isEliminated: true });
        io.emit('event:playersEliminated', { numbers });
    });

    socket.on('admin:unEliminatePlayer', async (data) => {
        const { sapId } = data;
        if (!sapId) return;
        try {
            const updatedUser = await User.findOneAndUpdate(
                { sapId },
                { isEliminated: false },
                { new: true }
            );
            if (updatedUser) {
                io.emit('event:playerUnEliminated', { sapId: updatedUser.sapId });
            }
        } catch (error) {
            console.error('Error un-eliminating player:', error);
        }
    });

    socket.on('admin:updateCoins', async (data) => {
        const { sapId, changeAmount } = data;
        if (!sapId || isNaN(changeAmount)) return;
        try {
            const updatedUser = await User.findOneAndUpdate({ sapId }, { $inc: { coins: parseInt(changeAmount) } }, { new: true });
            if (updatedUser) io.emit('event:coinsUpdated', { sapId, newBalance: updatedUser.coins });
        } catch (error) { console.error('Error updating coins in database:', error); }
    });

    socket.on('admin:endAuction', async (data) => {
        const { winnerSapId, itemName, finalBid } = data;
        if (!winnerSapId || !itemName || isNaN(finalBid)) return console.error('Invalid data for auction end:', data);
        try {
            const updatedUser = await User.findOneAndUpdate(
                { sapId: winnerSapId },
                { $inc: { coins: -finalBid }, $push: { wonItems: { name: itemName, winningBid: finalBid } } },
                { new: true }
            );
            if (updatedUser) {
                io.emit('event:auctionEnded', { winnerSapId, itemName, finalBid });
                io.emit('event:coinsUpdated', { sapId: updatedUser.sapId, newBalance: updatedUser.coins });
            }
        } catch (error) { console.error('Error processing auction winner:', error); }
    });

    socket.on('admin:startAuction', (data) => io.emit('event:auctionStarted', data));
    socket.on('student:placeBid', (data) => io.emit('event:newBid', data));
    socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

// --- Local Server Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});