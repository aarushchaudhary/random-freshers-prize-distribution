document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Views
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');

    // Login Elements
    const loginForm = document.getElementById('login-form');
    const sapIdInput = document.getElementById('sapId');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');

    // Game Elements
    const logoutBtn = document.getElementById('logout-btn');
    const welcomePlayerId = document.getElementById('welcome-player-id');
    const playerNumberDisplay = document.getElementById('player-number');
    const playerCoinsDisplay = document.getElementById('player-coins');
    const auctionZone = document.getElementById('auction-zone');
    const eliminatedOverlay = document.getElementById('eliminated-overlay');

    let currentUser = null;

    // ================================================================
    // *** 1. CHECK FOR SAVED SESSION ON PAGE LOAD ***
    // ================================================================
    function checkSession() {
        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            showGameView();
        }
    }
    // ================================================================


    // --- LOGIN LOGIC ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sapId = sapIdInput.value;
        const password = passwordInput.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sapId, password })
            });
            const data = await response.json();
            
            if (data.success) {
                // ================================================================
                // *** 2. SAVE USER TO SESSION STORAGE ON LOGIN ***
                // ================================================================
                sessionStorage.setItem('currentUser', JSON.stringify(data.user));
                // ================================================================

                if (data.user.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    currentUser = data.user;
                    showGameView();
                }
            } else {
                loginError.textContent = data.message;
                loginError.classList.remove('hidden');
            }
        } catch (error) {
            loginError.textContent = 'A network error occurred. Please try again.';
            loginError.classList.remove('hidden');
        }
    });
    
    // --- LOGOUT LOGIC ---
    logoutBtn.addEventListener('click', () => {
        // ================================================================
        // *** 3. CLEAR SESSION STORAGE ON LOGOUT ***
        // ================================================================
        sessionStorage.removeItem('currentUser');
        location.reload();
        // ================================================================
    });


    function showGameView() {
        loginView.classList.add('hidden');
        gameView.classList.remove('hidden');

        // Populate the welcome message
        welcomePlayerId.textContent = `Player ${currentUser.name.split(' ')[0]}${currentUser.assignedNumber}`;

        // Populate player info
        playerNumberDisplay.textContent = currentUser.assignedNumber.toString().padStart(3, '0');
        playerCoinsDisplay.textContent = currentUser.coins;
    }


    // --- SOCKET.IO EVENT LISTENERS ---
    socket.on('event:playersEliminated', (data) => {
        if (currentUser && data.numbers.includes(currentUser.assignedNumber)) {
            eliminatedOverlay.classList.remove('hidden');
        }
    });

    socket.on('event:coinsUpdated', (data) => {
        if (currentUser && data.sapId === currentUser.sapId) {
            playerCoinsDisplay.textContent = data.newBalance;
            currentUser.coins = data.newBalance; 
        }
    });

    socket.on('event:auctionStarted', (data) => {
        auctionZone.innerHTML = `
            <h3>NOW AUCTIONING: ${data.itemName}</h3>
            <p>Current High Bid: <span id="high-bid">0</span> coins</p>
            <div class="form-group" style="margin-top: 10px;">
                <input type="number" id="bid-amount" placeholder="Your bid amount">
            </div>
            <button id="place-bid-btn">Place Bid</button>
        `;
        document.getElementById('place-bid-btn').addEventListener('click', placeBid);
    });

    socket.on('event:newBid', (data) => {
        const highBidDisplay = document.getElementById('high-bid');
        if (highBidDisplay) {
            highBidDisplay.textContent = data.bidAmount;
        }
    });

    socket.on('event:auctionEnded', (data) => {
        auctionZone.innerHTML = `<h3>Auction for ${data.itemName} ENDED!</h3><p>Winner: ${data.winnerSapId} with a bid of ${data.finalBid} coins.</p>`;
    });

    function placeBid() {
        const bidAmountInput = document.getElementById('bid-amount');
        const bidAmount = parseInt(bidAmountInput.value);

        if (isNaN(bidAmount) || bidAmount <= 0) {
            alert('Please enter a valid bid amount.');
            return;
        }
        if (bidAmount > currentUser.coins) {
            alert("You don't have enough coins for this bid.");
            return;
        }

        socket.emit('student:placeBid', {
            sapId: currentUser.sapId,
            name: currentUser.name,
            bidAmount: bidAmount
        });
        bidAmountInput.value = '';
    }
    
    // Run the session check when the page first loads
    checkSession();
});