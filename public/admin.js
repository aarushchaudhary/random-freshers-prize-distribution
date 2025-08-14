document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Elements
    const logoutBtn = document.getElementById('admin-logout-btn');
    const userList = document.getElementById('user-list');
    const uploadForm = document.getElementById('upload-form'); // New
    const csvFileInput = document.getElementById('csv-file'); // New
    const uploadStatus = document.getElementById('upload-status'); // New
    // ... all other element declarations

    logoutBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    // --- NEW: CSV UPLOAD LOGIC ---
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = csvFileInput.files[0];
        if (!file) {
            alert('Please select a CSV file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('csvFile', file);

        uploadStatus.textContent = 'Uploading and processing...';
        uploadStatus.classList.remove('hidden');

        try {
            const response = await fetch('/api/upload-students', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (response.ok) {
                uploadStatus.textContent = result.message;
                fetchAndRenderUsers(); // Refresh the user list
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            uploadStatus.textContent = `Error: ${error.message}`;
        }
    });


    // ... The rest of your admin.js code remains the same ...
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

    userList.addEventListener('click', (e) => {
        if (e.target.classList.contains('un-eliminate-btn')) {
            const sapId = e.target.dataset.sapid;
            socket.emit('admin:unEliminatePlayer', { sapId });
        }
    });
    
    // All other functions and listeners...
    const eliminateInput = document.getElementById('eliminate-numbers');
    const eliminateBtn = document.getElementById('eliminate-btn');
    const coinSapIdInput = document.getElementById('coin-sapid');
    const coinAmountInput = document.getElementById('coin-amount');
    const updateCoinsBtn = document.getElementById('update-coins-btn');
    const itemNameInput = document.getElementById('item-name');
    const startAuctionBtn = document.getElementById('start-auction-btn');
    const endAuctionBtn = document.getElementById('end-auction-btn');
    let currentHighBid = { sapId: null, name: null, bidAmount: 0 };
    
    eliminateBtn.addEventListener('click', () => {
        const numbers = eliminateInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if(numbers.length > 0) socket.emit('admin:eliminateByNumber', { numbers });
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
        }
    });
    
    endAuctionBtn.addEventListener('click', () => {
        if(currentHighBid.sapId) {
            socket.emit('admin:endAuction', {
                winnerSapId: currentHighBid.sapId,
                itemName: itemNameInput.value.trim(),
                finalBid: currentHighBid.bidAmount
            });
            itemNameInput.value = '';
        } else {
            alert('No bids placed yet to end the auction.');
        }
    });

    socket.on('connect', () => {
        console.log('Admin connected to server.');
        fetchAndRenderUsers();
    });

    socket.on('event:playersEliminated', () => fetchAndRenderUsers());
    socket.on('event:playerUnEliminated', () => fetchAndRenderUsers());

    socket.on('event:coinsUpdated', (data) => {
        const userLi = userList.querySelector(`li[data-sapid="${data.sapId}"] .user-coins`);
        if(userLi) userLi.textContent = `${data.newBalance} SquidBits`;
    });

    socket.on('event:newBid', (data) => {
        if(data.bidAmount > currentHighBid.bidAmount) currentHighBid = data;
    });

    async function fetchAndRenderUsers() {
        try {
            const response = await fetch('/api/users');
            const data = await response.json();
            if(data.success) renderUserList(data.users);
        } catch (error) { console.error('Failed to fetch users:', error); }
    }

    fetchAndRenderUsers();
});