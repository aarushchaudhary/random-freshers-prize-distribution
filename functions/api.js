// --- Dependencies ---
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const multer = require('multer'); // For file uploads
const csv = require('csv-parser'); // For parsing CSV
const { Readable } = require('stream');

// --- Initial Setup & Middleware ---
const app = express();
const server = http.createServer(app);
app.use(cors());
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const upload = multer({ storage: multer.memoryStorage() }); // Configure multer to store files in memory

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
    // ... login logic remains the same ...
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
    // ... get users logic remains the same ...
    try {
        const users = await User.find({ role: 'student' }).sort({ assignedNumber: 1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Could not fetch users.' });
    }
});

// --- NEW: CSV UPLOAD ENDPOINT ---
router.post('/upload-students', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    const newUsers = [];
    const stream = Readable.from(req.file.buffer);

    try {
        // Get existing assigned numbers and SAP IDs to check for duplicates
        const existingUsers = await User.find({}, 'assignedNumber sapId');
        const existingNumbers = new Set(existingUsers.map(u => u.assignedNumber));
        const existingSapIds = new Set(existingUsers.map(u => u.sapId));

        const parser = stream.pipe(csv({ headers: ['name', 'sapId', 'password', 'gender'] }));

        for await (const row of parser) {
            // Validate row data
            if (!row.name || !row.sapId || !row.password || !row.gender) {
                console.log('Skipping invalid row:', row);
                continue;
            }

            // Skip if SAP ID already exists
            if (existingSapIds.has(row.sapId)) {
                console.log(`Skipping existing SAP ID: ${row.sapId}`);
                continue;
            }
            
            // Hash the password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(row.password, salt);
            
            // Generate a unique assigned number
            let assignedNumber;
            do {
                assignedNumber = Math.floor(Math.random() * 350) + 1;
            } while (existingNumbers.has(assignedNumber));
            existingNumbers.add(assignedNumber); // Add to set to prevent duplicates within the same file

            newUsers.push({
                name: row.name,
                sapId: row.sapId,
                password: hashedPassword,
                isGirl: row.gender.toLowerCase() === 'girl',
                assignedNumber: assignedNumber,
                // Defaults are handled by the schema (role, isEliminated, coins, wonItems)
            });
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

// --- Real-Time Logic with Socket.IO ---
// ... This entire section remains unchanged ...
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
            const updatedUser = await User.findOneAndUpdate({ sapId }, { isEliminated: false }, { new: true });
            if (updatedUser) {
                io.emit('event:playerUnEliminated', { sapId: updatedUser.sapId });
            }
        } catch (error) { console.error('Error un-eliminating player:', error); }
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