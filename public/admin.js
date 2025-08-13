document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Elements
    const logoutBtn = document.getElementById('admin-logout-btn');
    const userList = document.getElementById('user-list');
    const eliminateInput = document.getElementById('eliminate-numbers');
    const eliminateBtn = document.getElementById('eliminate-btn');
    const coinSapIdInput = document.getElementById('coin-sapid');
    const coinAmountInput = document.getElementById('coin-amount');
    const updateCoinsBtn = document.getElementById('update-coins-btn');
    const itemNameInput = document.getElementById('item-name');
    const startAuctionBtn = document.getElementById('start-auction-btn');
    const endAuctionBtn = document.getElementById('end-auction-btn');
    let currentHighBid = { sapId: null, name: null, bidAmount: 0 };

    // Logout
    logoutBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    // RENDER USER LIST (with Revive Button)
    function renderUserList(users) {
        userList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.dataset.sapid = user.sapId;
            
            let userHTML = `
                <span>#${user.assignedNumber} - ${user.name} (${user.sapId})</span>
                <span class="user-coins">${user.coins} coins</span>
            `;

            if (user.isEliminated) {
                li.classList.add('eliminated');
                userHTML += `<button class="un-eliminate-btn" data-sapid="${user.sapId}">Revive</button>`;
            }
            
            li.innerHTML = userHTML;
            userList.appendChild(li);
        });
    }

    // EVENT LISTENER FOR REVIVE BUTTONS
    userList.addEventListener('click', (e) => {
        if (e.target.classList.contains('un-eliminate-btn')) {
            const sapId = e.target.dataset.sapid;
            socket.emit('admin:unEliminatePlayer', { sapId });
        }
    });

    // ADMIN ACTIONS
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

    // SOCKET.IO LISTENERS
    socket.on('connect', () => {
        console.log('Admin connected to server.');
        fetchAndRenderUsers();
    });

    socket.on('event:playersEliminated', () => fetchAndRenderUsers());
    socket.on('event:playerUnEliminated', () => fetchAndRenderUsers());

    socket.on('event:coinsUpdated', (data) => {
        const userLi = userList.querySelector(`li[data-sapid="${data.sapId}"] .user-coins`);
        if(userLi) userLi.textContent = `${data.newBalance} coins`;
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