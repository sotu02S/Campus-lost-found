// State Management
let currentView = 'browse';
let currentItemId = null;
let userEmail = null;
let clerk;
let isAuthenticated = false;
let isAdmin = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initClerk();
    initializeEventListeners();
    await loadItems();
});

// Initialize Clerk
async function initClerk() {
    try {
        clerk = window.Clerk;
        await clerk.load({
            publishableKey: 'YOUR_CLERK_PUBLISHABLE_KEY' // Replace with your key
        });

        // Check authentication status
        if (clerk.user) {
            isAuthenticated = true;
            userEmail = clerk.user.primaryEmailAddress?.emailAddress;
            isAdmin = clerk.user.publicMetadata?.role === 'admin';
            
            // Update UI for authenticated user
            updateUIForAuth(true);
            
            // Mount user button
            clerk.mountUserButton(document.getElementById('user-button-main'));
        } else {
            updateUIForAuth(false);
        }
    } catch (error) {
        console.error('Clerk initialization error:', error);
        updateUIForAuth(false);
    }
}

// Update UI based on authentication
function updateUIForAuth(authenticated) {
    const signInBtn = document.getElementById('signInBtn');
    const postItemBtn = document.getElementById('postItemBtn');
    const myPostsBtn = document.getElementById('myPostsBtn');
    const userButton = document.getElementById('user-button-main');
    const adminBtn = document.getElementById('adminBtn');
    
    if (authenticated) {
        signInBtn.style.display = 'none';
        postItemBtn.style.display = 'inline-flex';
        myPostsBtn.style.display = 'block';
        userButton.style.display = 'block';
        
        if (isAdmin) {
            adminBtn.style.display = 'inline-flex';
        }
    } else {
        signInBtn.style.display = 'inline-flex';
        postItemBtn.style.display = 'none';
        myPostsBtn.style.display = 'none';
        userButton.style.display = 'none';
        adminBtn.style.display = 'none';
    }
}

// Show sign in modal
function showSignIn() {
    const overlay = document.getElementById('auth-overlay');
    overlay.style.display = 'flex';
    
    clerk.mountSignIn(document.getElementById('clerk-signin'), {
        afterSignInUrl: window.location.href,
        appearance: {
            elements: {
                rootBox: 'clerk-root',
                card: 'clerk-card'
            }
        }
    });
}

// Hide auth overlay
function hideAuthOverlay() {
    document.getElementById('auth-overlay').style.display = 'none';
}

// Event Listeners
function initializeEventListeners() {
    // Sign In button
    document.getElementById('signInBtn').addEventListener('click', showSignIn);
    
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!isAuthenticated && e.target.dataset.view === 'my-posts') {
                showSignIn();
                return;
            }
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.dataset.view;
            loadItems();
        });
    });

    // Post Item Modal
    document.getElementById('postItemBtn').addEventListener('click', openPostModal);
    document.getElementById('closePostModal').addEventListener('click', closePostModal);
    document.getElementById('cancelPost').addEventListener('click', closePostModal);
    document.getElementById('postForm').addEventListener('submit', handlePostSubmit);

    // Details Modal
    document.getElementById('closeDetailsModal').addEventListener('click', closeDetailsModal);

    // Message Modal
    document.getElementById('closeMessageModal').addEventListener('click', closeMessageModal);
    document.getElementById('messageForm').addEventListener('submit', handleMessageSubmit);

    // Search and Filters
    document.getElementById('searchInput').addEventListener('input', debounce(loadItems, 300));
    document.getElementById('categoryFilter').addEventListener('change', loadItems);
    document.getElementById('typeFilter').addEventListener('change', loadItems);
    document.getElementById('statusFilter').addEventListener('change', loadItems);

    // Image Upload Preview
    document.getElementById('imageUpload').addEventListener('change', handleImagePreview);

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Storage Functions (Vercel KV compatible)
async function saveToStorage(key, data) {
    try {
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, data })
        });
        return await response.json();
    } catch (error) {
        console.error('Storage error:', error);
        return null;
    }
}

async function getFromStorage(key) {
    try {
        const response = await fetch(`/api/storage?key=${key}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Storage error:', error);
        return null;
    }
}

async function getAllItems() {
    try {
        const response = await fetch('/api/storage?list=true');
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Storage error:', error);
        return [];
    }
}

// Load Items
async function loadItems() {
    const grid = document.getElementById('itemsGrid');
    grid.innerHTML = '<div class="loading">Loading items...</div>';

    const items = await getAllItems();
    
    if (!items || items.length === 0) {
        grid.innerHTML = '<div class="empty-state">No items found. Be the first to post!</div>';
        return;
    }

    // Apply filters
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    let filteredItems = items.filter(item => {
        const matchesSearch = !searchTerm || 
            item.name.toLowerCase().includes(searchTerm) ||
            item.description.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryFilter || item.category === categoryFilter;
        const matchesType = !typeFilter || item.type === typeFilter;
        const matchesStatus = !statusFilter || item.status === statusFilter;
        
        if (currentView === 'my-posts') {
            return matchesSearch && matchesCategory && matchesType && matchesStatus && 
                   item.contactEmail === userEmail;
        }
        
        return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });

    // Sort by date (newest first)
    filteredItems.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredItems.length === 0) {
        grid.innerHTML = '<div class="empty-state">No items match your filters.</div>';
        return;
    }

    grid.innerHTML = filteredItems.map(item => createItemCard(item)).join('');

    // Add click handlers
    document.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => openItemDetails(card.dataset.id));
    });
}

// Create Item Card
function createItemCard(item) {
    const date = new Date(item.date).toLocaleDateString();
    const imageContent = item.image 
        ? `<img src="${item.image}" alt="${item.name}">`
        : `<span>📦</span>`;

    return `
        <div class="item-card" data-id="${item.id}">
            <div class="item-image">${imageContent}</div>
            <div class="item-content">
                <div class="item-header">
                    <div>
                        <div class="item-title">${escapeHtml(item.name)}</div>
                    </div>
                    <span class="item-type ${item.type}">${item.type}</span>
                </div>
                <p class="item-description">${escapeHtml(item.description)}</p>
                <div class="item-meta">
                    <span>📍 ${escapeHtml(item.location)}</span>
                    <span>📅 ${date}</span>
                    <span class="badge ${item.status}">${item.status}</span>
                </div>
            </div>
        </div>
    `;
}

// Open Item Details
async function openItemDetails(itemId) {
    const items = await getAllItems();
    const item = items.find(i => i.id === itemId);
    
    if (!item) return;

    currentItemId = itemId;
    const modal = document.getElementById('detailsModal');
    const detailsDiv = document.getElementById('itemDetails');

    const date = new Date(item.date).toLocaleString();
    const imageContent = item.image 
        ? `<img src="${item.image}" alt="${item.name}">`
        : `<span>📦</span>`;

    const isOwnPost = item.contactEmail === userEmail;
    const statusButton = isOwnPost 
        ? `<button class="btn ${item.status === 'claimed' ? 'btn-secondary' : 'btn-primary'}" 
                    onclick="toggleStatus('${itemId}')">
                Mark as ${item.status === 'claimed' ? 'Unclaimed' : 'Claimed'}
            </button>`
        : '';

    const messageButton = !isOwnPost 
        ? `<button class="btn btn-primary" onclick="openMessageModal('${itemId}')">
                💬 Contact Owner
           </button>`
        : '';

    detailsDiv.innerHTML = `
        <div class="details-image">${imageContent}</div>
        <div class="details-header">
            <div class="details-info">
                <h3>${escapeHtml(item.name)}</h3>
                <div class="details-meta">
                    <span class="item-type ${item.type}">${item.type}</span>
                    <span class="badge ${item.status}">${item.status}</span>
                    <span>📍 ${escapeHtml(item.location)}</span>
                    <span>📅 ${date}</span>
                </div>
            </div>
        </div>
        <div class="details-section">
            <h4>Category</h4>
            <p>${escapeHtml(item.category)}</p>
        </div>
        <div class="details-section">
            <h4>Description</h4>
            <p>${escapeHtml(item.description)}</p>
        </div>
        <div class="details-actions">
            ${messageButton}
            ${statusButton}
        </div>
    `;

    modal.classList.add('active');
}

// Toggle Status
async function toggleStatus(itemId) {
    const items = await getAllItems();
    const item = items.find(i => i.id === itemId);
    
    if (!item || item.contactEmail !== userEmail) return;

    item.status = item.status === 'claimed' ? 'unclaimed' : 'claimed';
    await saveToStorage(`item_${itemId}`, item);
    
    closeDetailsModal();
    await loadItems();
}

// Open/Close Modals
function openPostModal() {
    if (!isAuthenticated) {
        showSignIn();
        return;
    }
    document.getElementById('postModal').classList.add('active');
    document.getElementById('postForm').reset();
    document.getElementById('imagePreview').classList.remove('active');
    
    // Pre-fill email
    if (userEmail) {
        document.getElementById('contactEmail').value = userEmail;
    }
}

function closePostModal() {
    document.getElementById('postModal').classList.remove('active');
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.remove('active');
    currentItemId = null;
}

function openMessageModal(itemId) {
    if (!isAuthenticated) {
        showSignIn();
        return;
    }
    currentItemId = itemId;
    loadMessages(itemId);
    document.getElementById('messageModal').classList.add('active');
}

function closeMessageModal() {
    document.getElementById('messageModal').classList.remove('active');
    currentItemId = null;
}

// Handle Post Submit
async function handlePostSubmit(e) {
    e.preventDefault();
    
    const formData = {
        id: 'item_' + Date.now(),
        name: document.getElementById('itemName').value,
        type: document.querySelector('input[name="type"]:checked').value,
        category: document.getElementById('category').value,
        description: document.getElementById('description').value,
        location: document.getElementById('location').value,
        contactEmail: document.getElementById('contactEmail').value,
        image: null,
        status: 'unclaimed',
        date: new Date().toISOString(),
        messages: []
    };

    // Handle image
    const imageFile = document.getElementById('imageUpload').files[0];
    if (imageFile) {
        formData.image = await convertToBase64(imageFile);
    }

    // Save user email
    userEmail = formData.contactEmail;
    localStorage.setItem('userEmail', userEmail);

    await saveToStorage(formData.id, formData);
    
    closePostModal();
    await loadItems();
}

// Image Preview
function handleImagePreview(e) {
    const file = e.target.files[0];
    if (!file) return;

    const preview = document.getElementById('imagePreview');
    const reader = new FileReader();

    reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        preview.classList.add('active');
    };

    reader.readAsDataURL(file);
}

// Convert Image to Base64
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Messages
async function loadMessages(itemId) {
    const items = await getAllItems();
    const item = items.find(i => i.id === itemId);
    
    if (!item) return;

    const threadDiv = document.getElementById('messageThread');
    
    if (!item.messages || item.messages.length === 0) {
        threadDiv.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
        return;
    }

    threadDiv.innerHTML = item.messages.map(msg => `
        <div class="message">
            <div class="message-header">
                <span class="message-sender">${escapeHtml(msg.sender)}</span>
                <span class="message-time">${new Date(msg.date).toLocaleString()}</span>
            </div>
            <div class="message-body">${escapeHtml(msg.text)}</div>
        </div>
    `).join('');

    threadDiv.scrollTop = threadDiv.scrollHeight;
}

async function handleMessageSubmit(e) {
    e.preventDefault();
    
    if (!currentItemId || !userEmail) return;

    const messageText = document.getElementById('messageInput').value;
    const items = await getAllItems();
    const item = items.find(i => i.id === currentItemId);
    
    if (!item) return;

    if (!item.messages) item.messages = [];

    item.messages.push({
        sender: userEmail,
        text: messageText,
        date: new Date().toISOString()
    });

    await saveToStorage(currentItemId, item);
    
    document.getElementById('messageInput').value = '';
    await loadMessages(currentItemId);
}

// Utility Functions
function getUserEmail() {
    userEmail = localStorage.getItem('userEmail');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make functions global for onclick handlers
window.toggleStatus = toggleStatus;
window.openMessageModal = openMessageModal;