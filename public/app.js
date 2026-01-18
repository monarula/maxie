const API_BASE = '/api/words';

// DOM Elements
const wordForm = document.getElementById('wordForm');
const wordInput = document.getElementById('wordInput');
const meaningInput = document.getElementById('meaningInput');
const searchInput = document.getElementById('searchInput');
const dictionaryContainer = document.getElementById('dictionaryContainer');
const wordCount = document.getElementById('wordCount');

// Load dictionary on page load
document.addEventListener('DOMContentLoaded', async () => {
    loadDictionary();
    await initializeNotifications();
});

// Notification management
let serviceWorkerRegistration = null;

async function initializeNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        document.getElementById('enableNotificationsBtn').style.display = 'none';
        document.getElementById('notificationStatus').textContent = 'Notifications not supported in this browser';
        return;
    }

    try {
        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        serviceWorkerRegistration = registration;
        console.log('Service Worker registered');

        // Check if already subscribed
        const subscription = await registration.pushManager.getSubscription();
        
        const enableBtn = document.getElementById('enableNotificationsBtn');
        const disableBtn = document.getElementById('disableNotificationsBtn');
        const status = document.getElementById('notificationStatus');

        if (subscription) {
            enableBtn.style.display = 'none';
            disableBtn.style.display = 'inline-block';
            status.textContent = '✓ Notifications enabled - You\'ll receive daily word notifications!';
            status.style.color = '#10b981';
        } else {
            enableBtn.style.display = 'inline-block';
            disableBtn.style.display = 'none';
            status.textContent = 'Notifications are disabled';
            status.style.color = '#64748b';
        }

        // Set up button handlers
        enableBtn.addEventListener('click', enableNotifications);
        disableBtn.addEventListener('click', disableNotifications);
    } catch (error) {
        console.error('Error initializing notifications:', error);
        document.getElementById('notificationStatus').textContent = 'Error setting up notifications';
    }
}

async function enableNotifications() {
    if (!serviceWorkerRegistration) {
        showNotification('Service Worker not ready. Please refresh the page.', 'error');
        return;
    }

    try {
        // Request notification permission
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
            showNotification('Notification permission denied', 'error');
            return;
        }

        // Get VAPID public key from server
        const vapidResponse = await fetch('/api/notifications/vapid-key');
        const { publicKey } = await vapidResponse.json();

        // Create push subscription
        const subscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // Send subscription to server
        const response = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(subscription),
        });

        if (response.ok) {
            document.getElementById('enableNotificationsBtn').style.display = 'none';
            document.getElementById('disableNotificationsBtn').style.display = 'inline-block';
            document.getElementById('notificationStatus').textContent = '✓ Notifications enabled - You\'ll receive daily word notifications!';
            document.getElementById('notificationStatus').style.color = '#10b981';
            showNotification('Notifications enabled successfully!', 'success');
        } else {
            throw new Error('Failed to save subscription');
        }
    } catch (error) {
        console.error('Error enabling notifications:', error);
        showNotification('Failed to enable notifications', 'error');
    }
}

async function disableNotifications() {
    try {
        const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
        
        if (subscription) {
            // Unsubscribe from push service
            await subscription.unsubscribe();

            // Notify server
            await fetch('/api/notifications/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ endpoint: subscription.endpoint }),
            });

            document.getElementById('enableNotificationsBtn').style.display = 'inline-block';
            document.getElementById('disableNotificationsBtn').style.display = 'none';
            document.getElementById('notificationStatus').textContent = 'Notifications are disabled';
            document.getElementById('notificationStatus').style.color = '#64748b';
            showNotification('Notifications disabled', 'success');
        }
    } catch (error) {
        console.error('Error disabling notifications:', error);
        showNotification('Failed to disable notifications', 'error');
    }
}

// Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Add word form submission
wordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const word = wordInput.value.trim();
    const meaning = meaningInput.value.trim();

    if (!word || !meaning) {
        alert('Please fill in both word and meaning');
        return;
    }

    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ word, meaning }),
        });

        const data = await response.json();

        if (response.ok) {
            // Clear form
            wordInput.value = '';
            meaningInput.value = '';
            wordInput.focus();
            
            // Reload dictionary
            loadDictionary();
            
            // Show success message
            showNotification('Word added successfully!', 'success');
        } else {
            showNotification(data.error || 'Failed to add word', 'error');
        }
    } catch (error) {
        console.error('Error adding word:', error);
        showNotification('Failed to add word. Please try again.', 'error');
    }
});

// Search functionality
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    searchTimeout = setTimeout(async () => {
        if (query) {
            await searchWords(query);
        } else {
            loadDictionary();
        }
    }, 300);
});

// Load all words
async function loadDictionary() {
    try {
        const response = await fetch(API_BASE);
        const words = await response.json();
        displayWords(words);
        updateWordCount(words.length);
    } catch (error) {
        console.error('Error loading dictionary:', error);
        showNotification('Failed to load dictionary', 'error');
    }
}

// Search words
async function searchWords(query) {
    try {
        const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
        const words = await response.json();
        displayWords(words);
        updateWordCount(words.length);
    } catch (error) {
        console.error('Error searching words:', error);
    }
}

// Display words in the grid
function displayWords(words) {
    if (words.length === 0) {
        dictionaryContainer.innerHTML = '<p class="empty-state">No words found. Try searching for something else or add a new word!</p>';
        return;
    }

    dictionaryContainer.innerHTML = words.map(word => `
        <div class="word-card">
            <div class="word-card-header">
                <h3 class="word-title">${escapeHtml(word.word)}</h3>
                <button class="delete-btn" onclick="deleteWord('${word.id}')" title="Delete word">
                    ×
                </button>
            </div>
            <p class="word-meaning">${escapeHtml(word.meaning)}</p>
        </div>
    `).join('');
}

// Delete word
async function deleteWord(id) {
    if (!confirm('Are you sure you want to delete this word?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
        });

        const data = await response.json();

        if (response.ok) {
            loadDictionary();
            showNotification('Word deleted successfully', 'success');
        } else {
            showNotification(data.error || 'Failed to delete word', 'error');
        }
    } catch (error) {
        console.error('Error deleting word:', error);
        showNotification('Failed to delete word', 'error');
    }
}

// Update word count
function updateWordCount(count) {
    wordCount.textContent = `${count} word${count !== 1 ? 's' : ''}`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
