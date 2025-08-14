document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Elements
    const userList = document.getElementById('user-list');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const activeTotalDisplay = document.getElementById('active-total');
    const activeBoysDisplay = document.getElementById('active-boys');
    const activeGirlsDisplay = document.getElementById('active-girls');
    const startQuestBtn = document.getElementById('start-quest-btn');
    const questStatus = document.getElementById('quest-status');
    const eliminateShapeBtns = document.querySelectorAll('.eliminate-shape-btn');
    const uploadForm = document.getElementById('upload-form');
    const csvFileInput = document.getElementById('csv-file');
    const uploadStatus = document.getElementById('upload-status');
    const eliminateInput = document.getElementById('eliminate-numbers');
    const eliminateBtn = document.getElementById('eliminate-btn');
    const coinSapIdInput = document.getElementById('coin-sapid');
    const coinAmountInput = document.getElementById('coin-amount');
    const updateCoinsBtn = document.getElementById('update-coins-btn');
    const itemNameInput = document.getElementById('item-name');
    const startAuctionBtn = document.getElementById('start-auction-btn');
    const endAuctionBtn = document.getElementById('end-auction-btn');
    const auctionLogDisplay = document.getElementById('auction-log-display');

    // Pagination Elements
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const currentPageSpan = document.getElementById('current-page');
    const totalPagesSpan = document.getElementById('total-pages');

    // State Variables
    let allUsers = [];
    let currentPage = 1;
    const itemsPerPage = 20;
    let currentHighBid = { sapId: null, name: null, bidAmount: 0 };
    let questTimerInterval;

    // --- HELPER FUNCTIONS ---
    async function fetchAndRenderUsers() {
        try {
            const response = await fetch('/api/users');
            const data = await response.json();
            if (data.success) {
                allUsers = data.users;
                currentPage = 1;
                displayPage();
                updatePlayerStats(allUsers);
            }
        } catch (error) { console.error('Failed to fetch users:', error); }
    }

    function displayPage() {
        const totalPages = Math.ceil(allUsers.length / itemsPerPage);
        totalPagesSpan.textContent = totalPages > 0 ? totalPages : 1;
        currentPageSpan.textContent = currentPage;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageUsers = allUsers.slice(startIndex, endIndex);
        
        renderUserList(pageUsers);

        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    }

    function renderUserList(users) {
        userList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.dataset.sapid = user.sapId;
            let userHTML = `
                <span>#${user.assignedNumber} - ${user.name} (${user.sapId})</span>
                <span class="user-coins">${user.coins} SquidBits</span>
            `;
            if (user.isEliminated) {
                li.classList.add('eliminated');
                userHTML += `<button class="un-eliminate-btn" data-sapid="${user.sapId}">Revive</button>`;
            }
            li.innerHTML = userHTML;
            userList.appendChild(li);
        });
    }

    function updatePlayerStats(users) {
        const activePlayers = users.filter(user => !user.isEliminated);
        const activeBoys = activePlayers.filter(user => !user.isEliminated && !user.isGirl).length;
        const activeGirls = activePlayers.filter(user => !user.isEliminated && user.isGirl).length;
        
        activeTotalDisplay.textContent = activePlayers.length;
        activeBoysDisplay.textContent = activeBoys;
        activeGirlsDisplay.textContent = activeGirls;
    }

    // --- EVENT LISTENERS ---
    logoutBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayPage();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(allUsers.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            displayPage();
        }
    });

    startQuestBtn.addEventListener('click', () => {
        if (questTimerInterval) return;
        const target = document.querySelector('input[name="quest-target"]:checked').value;
        socket.emit('admin:startShapeQuest', { target });
        
        let timeLeft = 15;
        questStatus.textContent = `Quest is LIVE for ${target.toUpperCase()}! Time left: ${timeLeft}s`;
        startQuestBtn.disabled = true;

        questTimerInterval = setInterval(() => {
            timeLeft--;
            questStatus.textContent = `Quest is LIVE for ${target.toUpperCase()}! Time left: ${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(questTimerInterval);
                questTimerInterval = null;
                questStatus.textContent = "Time's up! Choose a shape to eliminate.";
                startQuestBtn.disabled = false;
            }
        }, 1000);
    });

    eliminateShapeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const shape = btn.dataset.shape;
            socket.emit('admin:eliminateShape', { shape });
            questStatus.textContent = `Elimination signal sent for shape: ${shape.toUpperCase()}.`;
            setTimeout(() => { questStatus.textContent = 'Status: Idle'; }, 4000);
        });
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = csvFileInput.files[0];
        if (!file) { alert('Please select a CSV file to upload.'); return; }
        const formData = new FormData();
        formData.append('csvFile', file);
        uploadStatus.textContent = 'Uploading and processing...';
        uploadStatus.classList.remove('hidden');
        try {
            const response = await fetch('/api/upload-students', { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok) {
                uploadStatus.textContent = result.message;
                fetchAndRenderUsers();
            } else { throw new Error(result.message); }
        } catch (error) { uploadStatus.textContent = `Error: ${error.message}`; }
    });

    userList.addEventListener('click', (e) => {
        if (e.target.classList.contains('un-eliminate-btn')) {
            const sapId = e.target.dataset.sapid;
            socket.emit('admin:unEliminatePlayer', { sapId });
        }
    });

    eliminateBtn.addEventListener('click', () => {
        const numbers = eliminateInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if (numbers.length > 0) socket.emit('admin:eliminateByNumber', { numbers });
        eliminateInput.value = '';
    });

    updateCoinsBtn.addEventListener('click', () => {
        const sapId = coinSapIdInput.value.trim();
        const changeAmount = parseInt(coinAmountInput.value);
        if (sapId && !isNaN(changeAmount)) socket.emit('admin:updateCoins', { sapId, changeAmount });
        coinSapIdInput.value = '';
        coinAmountInput.value = '';
    });

    startAuctionBtn.addEventListener('click', () => {
        const itemName = itemNameInput.value.trim();
        if (itemName) {
            socket.emit('admin:startAuction', { itemName });
            currentHighBid = { sapId: null, name: null, bidAmount: 0 };
            auctionLogDisplay.innerHTML = `<p>Auction started for: <strong>${itemName}</strong></p>`;
        }
    });

    endAuctionBtn.addEventListener('click', () => {
        if (currentHighBid.sapId) {
            socket.emit('admin:endAuction', { winnerSapId: currentHighBid.sapId, itemName: itemNameInput.value.trim(), finalBid: currentHighBid.bidAmount });
            itemNameInput.value = '';
        } else { alert('No bids placed yet to end the auction.'); }
    });

    // --- SOCKET.IO LISTENERS ---
    socket.on('connect', () => { console.log('Admin connected to server.'); fetchAndRenderUsers(); });
    socket.on('event:playersEliminated', () => fetchAndRenderUsers());
    socket.on('event:playerUnEliminated', () => fetchAndRenderUsers());
    socket.on('event:coinsUpdated', (data) => { fetchAndRenderUsers(); });
    
    socket.on('event:newBid', (data) => {
        if (data.bidAmount > currentHighBid.bidAmount) {
            currentHighBid = data;
        }
        const logEntry = document.createElement('p');
        logEntry.innerHTML = `Bid: <strong>${data.bidAmount}</strong> by ${data.name} (${data.sapId})`;
        auctionLogDisplay.appendChild(logEntry);
        auctionLogDisplay.scrollTop = auctionLogDisplay.scrollHeight;
    });
    
    socket.on('event:auctionEnded', (data) => {
        const winnerEntry = document.createElement('p');
        winnerEntry.className = 'winner';
        winnerEntry.innerHTML = `SOLD to <strong>${data.winnerSapId}</strong> for <strong>${data.finalBid}</strong> SquidBits!`;
        auctionLogDisplay.appendChild(winnerEntry);
        auctionLogDisplay.scrollTop = auctionLogDisplay.scrollHeight;
    });
    
    // --- INITIAL LOAD ---
    fetchAndRenderUsers();
});
