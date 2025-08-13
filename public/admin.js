document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- NEW: Logout Button ---
    const logoutBtn = document.getElementById('admin-logout-btn');
    logoutBtn.addEventListener('click', () => {
        // Redirect back to the main login page
        window.location.href = 'index.html';
    });
    // --- END NEW ---

    // Elimination Elements
    const eliminateInput = document.getElementById('eliminate-numbers');
    const eliminateBtn = document.getElementById('eliminate-btn');

    // Coin Elements
    const coinSapIdInput = document.getElementById('coin-sapid');
    const coinAmountInput = document.getElementById('coin-amount');
    const updateCoinsBtn = document.getElementById('update-coins-btn');

    // Auction Elements
    const itemNameInput = document.getElementById('item-name');
    const startAuctionBtn = document.getElementById('start-auction-btn');
    const endAuctionBtn = document.getElementById('end-auction-btn');

    // User List
    const userList = document.getElementById('user-list');
    
    let currentHighBid = { sapId: null, name: null, bidAmount: 0 };


    // --- Initial Data Load ---
    async function fetchAndRenderUsers() {
        try {
            const response = await fetch('/api/users');
            const data = await response.json();
            if(data.success) {
                renderUserList(data.users);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    }

    function renderUserList(users) {
        userList.innerHTML = ''; // Clear current list
        users.forEach(user => {
            const li = document.createElement('li');
            li.dataset.sapid = user.sapId;
            li.innerHTML = `
                <span>#${user.assignedNumber} - ${user.name} (${user.sapId})</span>
                <span class="user-coins">${user.coins} coins</span>
            `;
            if (user.isEliminated) {
                li.classList.add('eliminated');
            }
            userList.appendChild(li);
        });
    }

    // --- Admin Actions (Emitting Events) ---
    eliminateBtn.addEventListener('click', () => {
        const numbers = eliminateInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if(numbers.length > 0) {
            socket.emit('admin:eliminateByNumber', { numbers });
            eliminateInput.value = '';
        }
    });

    updateCoinsBtn.addEventListener('click', () => {
        const sapId = coinSapIdInput.value.trim();
        const changeAmount = parseInt(coinAmountInput.value);
        if (sapId && !isNaN(changeAmount)) {
            socket.emit('admin:updateCoins', { sapId, changeAmount });
            coinSapIdInput.value = '';
            coinAmountInput.value = '';
        }
    });
    
    startAuctionBtn.addEventListener('click', () => {
        const itemName = itemNameInput.value.trim();
        if (itemName) {
            socket.emit('admin:startAuction', { itemName });
            currentHighBid = { sapId: null, name: null, bidAmount: 0 }; // Reset for new auction
        }
    });
    
    endAuctionBtn.addEventListener('click', () => {
        if(currentHighBid.sapId) {
            socket.emit('admin:endAuction', {
                winnerSapId: currentHighBid.sapId,
                itemName: itemNameInput.value.trim(),
                finalBid: currentHighBid.bidAmount
            });
            // Also deduct coins from the winner
            socket.emit('admin:updateCoins', { 
                sapId: currentHighBid.sapId, 
                changeAmount: -currentHighBid.bidAmount 
            });
            itemNameInput.value = '';
        } else {
            alert('No bids placed yet to end the auction.');
        }
    });


    // --- Socket.IO Listeners (Updating Admin UI) ---
    socket.on('connect', () => {
        console.log('Admin connected to server.');
        fetchAndRenderUsers();
    });

    socket.on('event:playersEliminated', (data) => {
        data.numbers.forEach(num => {
            // This is a simple approach. For performance, a map would be better.
            const li = Array.from(userList.children).find(item => item.textContent.startsWith(`#${num}`));
            if(li) li.classList.add('eliminated');
        });
    });

    socket.on('event:coinsUpdated', (data) => {
        const userLi = userList.querySelector(`li[data-sapid="${data.sapId}"] .user-coins`);
        if(userLi) {
            userLi.textContent = `${data.newBalance} coins`;
        }
    });
    
    socket.on('event:newBid', (data) => {
        if(data.bidAmount > currentHighBid.bidAmount) {
            currentHighBid = data;
            console.log(`New high bid: ${data.bidAmount} by ${data.name}`);
        }
    });

    // Initial load
    fetchAndRenderUsers();
});