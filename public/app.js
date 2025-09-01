document.addEventListener('DOMContentLoaded', () => {
    // MODIFIED to force WebSocket transport
    const socket = io({ transports: ['websocket'] });

    // Views & Overlays
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');
    const eliminatedOverlay = document.getElementById('eliminated-overlay');
    const shapeQuestOverlay = document.getElementById('shape-quest-overlay');

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
    const wonItemsList = document.getElementById('won-items-list');
    const shapeQuestContent = document.querySelector('.shape-quest-content');

    let currentUser = null;
    let sessionToken = null;
    let shapeQuestTimerInterval;

    socket.on('connect', () => {
        console.log('Socket connected via WebSocket.');
        if (currentUser && sessionToken) {
            socket.emit('authenticate', { sapId: currentUser.sapId, token: sessionToken });
        }
    });

    socket.on('forceDisconnect', () => {
        alert('Another device has logged into this account. You have been disconnected.');
        sessionStorage.clear();
        location.reload();
    });

    function checkSession() {
        const savedSession = sessionStorage.getItem('sessionData');
        if (savedSession) {
            const { user, token } = JSON.parse(savedSession);
            currentUser = user;
            sessionToken = token;
            if (currentUser.isEliminated) {
                eliminatedOverlay.classList.remove('hidden');
            }
            showGameView();
        }
    }

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
                sessionStorage.setItem('sessionData', JSON.stringify({ user: data.user, token: data.token }));
                if (data.user.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    currentUser = data.user;
                    sessionToken = data.token;
                    socket.emit('authenticate', { sapId: currentUser.sapId, token: sessionToken });
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

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('sessionData');
        location.reload();
    });

    function showGameView() {
        loginView.classList.add('hidden');
        gameView.classList.remove('hidden');
        welcomePlayerId.textContent = `Player ${currentUser.name.split(' ')[0]}${currentUser.assignedNumber}`;
        playerNumberDisplay.textContent = currentUser.assignedNumber.toString().padStart(3, '0');
        playerCoinsDisplay.textContent = currentUser.coins;
        renderWonItems();
    }

    function renderWonItems() {
        wonItemsList.innerHTML = '';
        if (currentUser.wonItems && currentUser.wonItems.length > 0) {
            currentUser.wonItems.forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.name} (Bid: ${item.winningBid} SquidBits)`;
                wonItemsList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = '(No items won yet)';
            wonItemsList.appendChild(li);
        }
    }

    function startShapeQuest(duration, target) {
        if (currentUser && !currentUser.isEliminated) {
            const myGender = currentUser.isGirl ? 'girls' : 'boys';
            if (target === 'all' || target === myGender) {
                shapeQuestContent.innerHTML = `
                    <h1>Choose Your Shape!</h1>
                    <div id="shape-quest-timer">${duration}</div>
                    <div class="shape-options">
                        <button class="shape-btn" data-shape="circle">○</button>
                        <button class="shape-btn" data-shape="triangle">△</button>
                        <button class="shape-btn" data-shape="square">□</button>
                    </div>
                    <p>You must choose before the timer runs out!</p>`;
                
                document.querySelectorAll('.shape-btn').forEach(btn => {
                    btn.addEventListener('click', handleShapeClick);
                });
                
                shapeQuestOverlay.classList.remove('hidden');
                let timeLeft = duration;
                const timerDisplay = document.getElementById('shape-quest-timer');
                
                if (shapeQuestTimerInterval) clearInterval(shapeQuestTimerInterval);
                shapeQuestTimerInterval = setInterval(() => {
                    timeLeft--;
                    if (timerDisplay) timerDisplay.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(shapeQuestTimerInterval);
                        shapeQuestOverlay.classList.add('hidden');
                    }
                }, 1000);
            }
        }
    }

    function renderAuction(data) {
        auctionZone.innerHTML = `
            <h3>NOW AUCTIONING: ${data.itemName}</h3>
            <p>Current High Bid: <span id="high-bid">${data.highBid || 0}</span> SquidBits</p>
            <div class="form-group" style="margin-top: 10px;">
                <input type="number" id="bid-amount" placeholder="Your bid amount">
            </div>
            <button id="place-bid-btn">Place Bid</button>`;
        document.getElementById('place-bid-btn').addEventListener('click', placeBid);
    }
    
    socket.on('event:shapeQuestStarted', (data) => {
        startShapeQuest(30, data.target);
    });

    socket.on('event:shapeQuestSync', (data) => {
        console.log('Syncing to existing shape quest:', data);
        startShapeQuest(data.remainingTime, data.target);
    });
    
    function handleShapeClick(event) {
        const shape = event.target.dataset.shape;
        socket.emit('student:shapeSelected', { sapId: currentUser.sapId, shape });
        shapeQuestContent.innerHTML = `<h1>You chose: ${event.target.textContent}</h1><p>Waiting for results...</p>`;
    }
    
    socket.on('event:playersEliminated', (data) => {
        if (currentUser && data.numbers.includes(currentUser.assignedNumber)) {
            eliminatedOverlay.classList.remove('hidden');
            currentUser.isEliminated = true;
            sessionStorage.setItem('sessionData', JSON.stringify({ user: currentUser, token: sessionToken }));
        }
    });
    
    socket.on('event:playerUnEliminated', (data) => { 
        if (currentUser && data.sapId === currentUser.sapId) { 
            eliminatedOverlay.classList.add('hidden'); 
            currentUser.isEliminated = false; 
            sessionStorage.setItem('sessionData', JSON.stringify({ user: currentUser, token: sessionToken }));
        } 
    });
    
    socket.on('event:coinsUpdated', (data) => { 
        if (currentUser && data.sapId === currentUser.sapId) { 
            playerCoinsDisplay.textContent = data.newBalance; 
            currentUser.coins = data.newBalance; 
            sessionStorage.setItem('sessionData', JSON.stringify({ user: currentUser, token: sessionToken }));
        } 
    });
    
    socket.on('event:auctionEnded', (data) => { 
        auctionZone.innerHTML = `<h3>Auction for ${data.itemName} ENDED!</h3><p>Winner: ${data.winnerSapId} with a bid of ${data.finalBid} SquidBits.</p>`; 
        if (currentUser && data.winnerSapId === currentUser.sapId) { 
            currentUser.wonItems.push({ name: data.itemName, winningBid: data.finalBid }); 
            renderWonItems(); 
            sessionStorage.setItem('sessionData', JSON.stringify({ user: currentUser, token: sessionToken }));
        } 
    });
    
    socket.on('event:auctionStarted', (data) => {
        renderAuction(data);
    });

    socket.on('event:auctionSync', (data) => {
        renderAuction(data);
    });
    
    socket.on('event:newBid', (data) => { 
        const highBidDisplay = document.getElementById('high-bid'); 
        if (highBidDisplay) highBidDisplay.textContent = data.bidAmount; 
    });

    function placeBid() { 
        const bidAmountInput = document.getElementById('bid-amount'); 
        const bidAmount = parseInt(bidAmountInput.value); 
        if (isNaN(bidAmount) || bidAmount <= 0) { 
            alert('Please enter a valid bid amount.'); 
            return; 
        } 
        if (bidAmount > currentUser.coins) { 
            alert("You don't have enough SquidBits for this bid."); 
            return; 
        } 
        socket.emit('student:placeBid', { 
            sapId: currentUser.sapId, 
            name: currentUser.name, 
            bidAmount: bidAmount 
        }); 
        bidAmountInput.value = ''; 
    }
    
    checkSession();
});