// Clerk Authentication
let clerk;
let isAdmin = false;

// Initialize Clerk
async function initClerk() {
    try {
        clerk = window.Clerk;
        await clerk.load({
            publishableKey: 'YOUR_CLERK_PUBLISHABLE_KEY' // Replace with your key
        });

        // Check if user is signed in
        if (clerk.user) {
            // Check if user is admin (you can customize this logic)
            isAdmin = clerk.user.publicMetadata?.role === 'admin';
            
            if (!isAdmin) {
                window.location.href = 'index.html';
                return;
            }

            // Mount user button
            clerk.mountUserButton(document.getElementById('user-button'));
            
            // Load dashboard
            await loadDashboard();
        } else {
            // Redirect to sign in
            await clerk.redirectToSignIn({
                redirectUrl: window.location.href
            });
        }
    } catch (error) {
        console.error('Clerk initialization error:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initClerk();
    initializeAdminListeners();
});

// Admin Event Listeners
function initializeAdminListeners() {
    // Navigation
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const panel = target.dataset.panel;
            
            // Update active state
            document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
            target.classList.add('active');
            
            // Show panel
            document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`${panel}-panel`).classList.add('active');
            
            // Load panel data
            loadPanelData(panel);
        });
    });

    // Search filters
    document.getElementById('itemSearch')?.addEventListener('input', debounce(filterItems, 300));
    document.getElementById('userSearch')?.addEventListener('input', debounce(filterUsers, 300));
    document.getElementById('dateRange')?.addEventListener('change', loadDashboard);

    // Export button
    document.getElementById('exportItems')?.addEventListener('click', exportItemsToCSV);
}

// Load Dashboard
async function loadDashboard() {
    const items = await getAllItems();
    
    // Calculate stats
    const totalItems = items.length;
    const claimedItems = items.filter(i => i.status === 'claimed').length;
    const pendingItems = items.filter(i => i.status === 'unclaimed').length;
    const activeUsers = new Set(items.map(i => i.contactEmail)).size;
    
    // Update stat cards
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('claimedItems').textContent = claimedItems;
    document.getElementById('pendingItems').textContent = pendingItems;
    document.getElementById('activeUsers').textContent = activeUsers;
    
    // Load charts
    loadItemsChart(items);
    loadCategoryChart(items);
    
    // Load recent activity
    loadRecentActivity(items);
}

// Load Panel Data
async function loadPanelData(panel) {
    switch(panel) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'items':
            await loadAllItemsTable();
            break;
        case 'flagged':
            await loadFlaggedItems();
            break;
        case 'users':
            await loadUsersTable();
            break;
        case 'analytics':
            await loadAnalytics();
            break;
    }
}

// Load All Items Table
async function loadAllItemsTable() {
    const items = await getAllItems();
    const tableDiv = document.getElementById('itemsTable');
    
    if (items.length === 0) {
        tableDiv.innerHTML = '<div class="empty-state">No items found</div>';
        return;
    }
    
    const tableHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Posted By</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    ${item.image ? `<img src="${item.image}" style="width: 40px; height: 40px; border-radius: 0.25rem; object-fit: cover;">` : '📦'}
                                    <strong>${escapeHtml(item.name)}</strong>
                                </div>
                            </td>
                            <td><span class="badge ${item.type === 'lost' ? 'danger' : 'success'}">${item.type}</span></td>
                            <td>${escapeHtml(item.category)}</td>
                            <td><span class="badge ${item.status === 'claimed' ? 'success' : 'warning'}">${item.status}</span></td>
                            <td>${new Date(item.date).toLocaleDateString()}</td>
                            <td>${escapeHtml(item.contactEmail)}</td>
                            <td class="table-actions">
                                <button class="icon-btn" onclick="viewItemDetails('${item.id}')" title="View">👁️</button>
                                <button class="icon-btn" onclick="editItem('${item.id}')" title="Edit">✏️</button>
                                <button class="icon-btn" onclick="deleteItem('${item.id}')" title="Delete">🗑️</button>
                                <button class="icon-btn" onclick="flagItem('${item.id}')" title="Flag">🚩</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    tableDiv.innerHTML = tableHTML;
}

// Load Flagged Items
async function loadFlaggedItems() {
    const flaggedData = await getFromStorage('flagged_items') || [];
    const items = await getAllItems();
    
    const flaggedItems = flaggedData.map(flag => {
        const item = items.find(i => i.id === flag.itemId);
        return item ? { ...item, flagReason: flag.reason, flagDate: flag.date } : null;
    }).filter(Boolean);
    
    document.getElementById('flaggedCount').textContent = flaggedItems.length;
    
    const flaggedDiv = document.getElementById('flaggedItems');
    
    if (flaggedItems.length === 0) {
        flaggedDiv.innerHTML = '<div class="empty-state">No flagged items</div>';
        return;
    }
    
    flaggedDiv.innerHTML = flaggedItems.map(item => `
        <div class="flagged-item">
            <div class="flagged-item-image">
                ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '<span style="font-size: 3rem;">📦</span>'}
            </div>
            <div class="flagged-item-content">
                <div class="flagged-item-header">
                    <h3 class="flagged-item-title">${escapeHtml(item.name)}</h3>
                    <span class="flagged-reason">${escapeHtml(item.flagReason)}</span>
                </div>
                <p>${escapeHtml(item.description)}</p>
                <div class="flagged-item-meta">
                    <span>📍 ${escapeHtml(item.location)}</span>
                    <span>📅 Flagged on ${new Date(item.flagDate).toLocaleDateString()}</span>
                    <span>👤 ${escapeHtml(item.contactEmail)}</span>
                </div>
                <div class="flagged-actions">
                    <button class="btn btn-primary" onclick="approveItem('${item.id}')">Approve</button>
                    <button class="btn btn-danger" onclick="deleteItem('${item.id}')">Delete</button>
                    <button class="btn btn-secondary" onclick="contactUser('${item.contactEmail}')">Contact User</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Load Users Table
async function loadUsersTable() {
    const items = await getAllItems();
    const userEmails = [...new Set(items.map(i => i.contactEmail))];
    
    const usersData = userEmails.map(email => {
        const userItems = items.filter(i => i.contactEmail === email);
        const claimed = userItems.filter(i => i.status === 'claimed').length;
        return {
            email,
            totalPosts: userItems.length,
            claimed,
            lastActive: new Date(Math.max(...userItems.map(i => new Date(i.date)))).toLocaleDateString()
        };
    });
    
    const tableDiv = document.getElementById('usersTable');
    
    const tableHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Total Posts</th>
                        <th>Items Claimed</th>
                        <th>Last Active</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${usersData.map(user => `
                        <tr>
                            <td><strong>${escapeHtml(user.email)}</strong></td>
                            <td>${user.totalPosts}</td>
                            <td><span class="badge success">${user.claimed}</span></td>
                            <td>${user.lastActive}</td>
                            <td class="table-actions">
                                <button class="icon-btn" onclick="viewUserActivity('${user.email}')" title="View Activity">📊</button>
                                <button class="icon-btn" onclick="contactUser('${user.email}')" title="Contact">✉️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    tableDiv.innerHTML = tableHTML;
}

// Load Analytics
async function loadAnalytics() {
    const items = await getAllItems();
    
    // Success rate
    const claimed = items.filter(i => i.status === 'claimed').length;
    const successRate = items.length > 0 ? Math.round((claimed / items.length) * 100) : 0;
    document.getElementById('successRate').textContent = successRate + '%';
    
    // Average response time (mock data - you'd calculate from messages)
    document.getElementById('avgResponseTime').textContent = '2.5h';
    
    // Top categories
    const categoryCounts = {};
    items.forEach(item => {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });
    
    const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const topCategoriesDiv = document.getElementById('topCategories');
    topCategoriesDiv.innerHTML = topCategories.map((cat, idx) => `
        <div class="top-list-item">
            <div class="top-list-rank">${idx + 1}</div>
            <div class="top-list-name">${cat[0]}</div>
            <div class="top-list-count">${cat[1]}</div>
        </div>
    `).join('');
    
    // Load activity chart
    loadActivityChart(items);
}

// Charts
function loadItemsChart(items) {
    const ctx = document.getElementById('itemsChart')?.getContext('2d');
    if (!ctx) return;
    
    // Get last 7 days
    const dates = [];
    const lostData = [];
    const foundData = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const dayItems = items.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate.toDateString() === date.toDateString();
        });
        
        lostData.push(dayItems.filter(i => i.type === 'lost').length);
        foundData.push(dayItems.filter(i => i.type === 'found').length);
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Lost Items',
                    data: lostData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Found Items',
                    data: foundData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#cbd5e1' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#cbd5e1' },
                    grid: { color: '#334155' }
                },
                x: {
                    ticks: { color: '#cbd5e1' },
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

function loadCategoryChart(items) {
    const ctx = document.getElementById('categoryChart')?.getContext('2d');
    if (!ctx) return;
    
    const categoryCounts = {};
    items.forEach(item => {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                data: Object.values(categoryCounts),
                backgroundColor: [
                    '#6366f1',
                    '#8b5cf6',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#06b6d4'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#cbd5e1', padding: 15 }
                }
            }
        }
    });
}

function loadActivityChart(items) {
    const ctx = document.getElementById('activityChart')?.getContext('2d');
    if (!ctx) return;
    
    // Mock hourly activity data
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const activityData = hours.map(() => Math.floor(Math.random() * 50));
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hours.map(h => h + ':00'),
            datasets: [{
                label: 'Activity',
                data: activityData,
                backgroundColor: '#6366f1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#cbd5e1' },
                    grid: { color: '#334155' }
                },
                x: {
                    ticks: { color: '#cbd5e1' },
                    grid: { display: false }
                }
            }
        }
    });
}

// Recent Activity
function loadRecentActivity(items) {
    const recentItems = items.slice(0, 5);
    const activityDiv = document.getElementById('recentActivity');
    
    activityDiv.innerHTML = recentItems.map(item => `
        <div class="activity-item">
            <div class="activity-icon" style="background: ${item.type === 'lost' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}">
                ${item.type === 'lost' ? '❌' : '✅'}
            </div>
            <div class="activity-content">
                <div class="activity-title">New ${item.type} item posted</div>
                <div class="activity-description">${escapeHtml(item.name)} - ${escapeHtml(item.category)}</div>
            </div>
            <div class="activity-time">${getTimeAgo(item.date)}</div>
        </div>
    `).join('');
}

// Admin Actions
async function viewItemDetails(itemId) {
    const items = await getAllItems();
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const modal = document.getElementById('itemDetailsModal');
    const detailsDiv = document.getElementById('adminItemDetails');
    
    detailsDiv.innerHTML = `
        <div style="padding: 1.5rem;">
            ${item.image ? `<img src="${item.image}" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 0.75rem; margin-bottom: 1.5rem;">` : ''}
            <h3>${escapeHtml(item.name)}</h3>
            <div style="margin: 1rem 0;">
                <span class="badge ${item.type === 'lost' ? 'danger' : 'success'}">${item.type}</span>
                <span class="badge ${item.status === 'claimed' ? 'success' : 'warning'}">${item.status}</span>
            </div>
            <p><strong>Category:</strong> ${escapeHtml(item.category)}</p>
            <p><strong>Location:</strong> ${escapeHtml(item.location)}</p>
            <p><strong>Description:</strong> ${escapeHtml(item.description)}</p>
            <p><strong>Posted by:</strong> ${escapeHtml(item.contactEmail)}</p>
            <p><strong>Date:</strong> ${new Date(item.date).toLocaleString()}</p>
        </div>
    `;
    
    modal.classList.add('active');
}

async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
        await fetch(`/api/storage?key=${itemId}`, { method: 'DELETE' });
        await loadPanelData('items');
        alert('Item deleted successfully');
    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete item');
    }
}

async function flagItem(itemId) {
    const reason = prompt('Enter reason for flagging:');
    if (!reason) return;
    
    const flaggedItems = await getFromStorage('flagged_items') || [];
    flaggedItems.push({
        itemId,
        reason,
        date: new Date().toISOString()
    });
    
    await saveToStorage('flagged_items', flaggedItems);
    alert('Item flagged successfully');
}

async function approveItem(itemId) {
    const flaggedItems = await getFromStorage('flagged_items') || [];
    const updated = flaggedItems.filter(f => f.itemId !== itemId);
    await saveToStorage('flagged_items', updated);
    await loadFlaggedItems();
}

function editItem(itemId) {
    alert('Edit functionality - implement as needed');
}

function contactUser(email) {
    window.location.href = `mailto:${email}`;
}

function viewUserActivity(email) {
    alert(`View activity for ${email} - implement as needed`);
}

// Export to CSV
async function exportItemsToCSV() {
    const items = await getAllItems();
    
    const csv = [
        ['ID', 'Name', 'Type', 'Category', 'Status', 'Location', 'Description', 'Email', 'Date'],
        ...items.map(item => [
            item.id,
            item.name,
            item.type,
            item.category,
            item.status,
            item.location,
            item.description,
            item.contactEmail,
            item.date
        ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lost-found-items-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// Utility Functions
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function filterItems() {
    // Implement filtering logic
}

function filterUsers() {
    // Implement filtering logic
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Storage functions (same as main app)
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