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
    await loadLastAddedTime();
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
            
            // Reload dictionary and update last added time
            loadDictionary();
            if (data.lastAdded) {
                updateLastAddedTime(data.lastAdded);
            }
            
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

// Auto-lookup functionality
const lookupBtn = document.getElementById('lookupBtn');
let lookupTimeout;

// Auto-lookup when user stops typing in word input
wordInput.addEventListener('input', (e) => {
    const word = e.target.value.trim();
    // Clear any existing timeout
    clearTimeout(lookupTimeout);
});

// Lookup button click
lookupBtn.addEventListener('click', async () => {
    const word = wordInput.value.trim();
    if (!word) {
        showNotification('Please enter a word first', 'error');
        return;
    }
    await lookupWordMeaning(word);
});

// Auto-lookup on Enter key in word input
wordInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        const word = wordInput.value.trim();
        if (word) {
            await lookupWordMeaning(word);
        }
    }
});

// Load all words
async function loadDictionary() {
    try {
        const response = await fetch(API_BASE);
        const words = await response.json();
        displayWords(words);
        updateWordCount(words.length);
        
        // Calculate last added time from dictionary
        if (words.length > 0) {
            const lastWord = words.reduce((latest, word) => {
                const wordTime = new Date(word.createdAt).getTime();
                const latestTime = latest ? new Date(latest.createdAt).getTime() : 0;
                return wordTime > latestTime ? word : latest;
            }, null);
            
            if (lastWord && lastWord.createdAt) {
                updateLastAddedTime(lastWord.createdAt);
            } else {
                document.getElementById('lastAdded').textContent = '';
            }
        } else {
            document.getElementById('lastAdded').textContent = '';
        }
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

// Load last added time
async function loadLastAddedTime() {
    try {
        const response = await fetch('/api/words/last-added');
        const data = await response.json();
        
        if (data.lastAdded) {
            updateLastAddedTime(data.lastAdded);
        } else {
            document.getElementById('lastAdded').textContent = '';
        }
    } catch (error) {
        console.error('Error loading last added time:', error);
    }
}

// Update last added time display
function updateLastAddedTime(timestamp) {
    const lastAddedEl = document.getElementById('lastAdded');
    
    if (!timestamp) {
        lastAddedEl.textContent = '';
        return;
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let timeText = '';

    if (diffMins < 1) {
        timeText = 'Just now';
    } else if (diffMins < 60) {
        timeText = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        timeText = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        timeText = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
        // Format as date for older entries
        const options = { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        };
        timeText = date.toLocaleDateString('en-US', options);
    }

    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    lastAddedEl.innerHTML = `<span>Last word: ${dayName} at ${timeStr}</span><br><span style="font-size: 0.75rem;">(${timeText})</span>`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-lookup word meaning from dictionary API
async function lookupWordMeaning(word) {
    const modal = document.getElementById('lookupModal');
    const loadingEl = document.getElementById('lookupLoading');
    const resultEl = document.getElementById('lookupResult');
    const errorEl = document.getElementById('lookupError');
    const useBtn = document.getElementById('useAutoMeaningBtn');
    const editBtn = document.getElementById('editManuallyBtn');

    // Show modal and loading state
    modal.style.display = 'flex';
    loadingEl.style.display = 'block';
    resultEl.style.display = 'none';
    errorEl.style.display = 'none';
    useBtn.style.display = 'none';
    editBtn.style.display = 'none';

    try {
        // Use Free Dictionary API (no API key required)
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        
        if (!response.ok) {
            throw new Error('Word not found');
        }

        const data = await response.json();
        
        if (data && data.length > 0) {
            // Extract the first definition
            const entry = data[0];
            let definition = '';

            // Try to get the first meaning from phonetics/meanings
            if (entry.meanings && entry.meanings.length > 0) {
                const firstMeaning = entry.meanings[0];
                if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
                    definition = firstMeaning.definitions[0].definition;
                }
            }

            // If no definition found, construct one from available data
            if (!definition && entry.meanings && entry.meanings.length > 0) {
                const parts = entry.meanings.map(m => {
                    if (m.definitions && m.definitions.length > 0) {
                        return m.partOfSpeech ? `${m.partOfSpeech}: ${m.definitions[0].definition}` : m.definitions[0].definition;
                    }
                    return null;
                }).filter(Boolean);
                definition = parts.join(' | ');
            }

            if (definition) {
                // Show result
                loadingEl.style.display = 'none';
                document.getElementById('lookupWordText').textContent = entry.word || word;
                document.getElementById('lookupMeaningText').textContent = definition;
                resultEl.style.display = 'block';
                useBtn.style.display = 'inline-block';
                editBtn.style.display = 'inline-block';

                // Store the definition for use
                useBtn.onclick = () => {
                    meaningInput.value = definition;
                    closeLookupModal();
                    meaningInput.focus();
                    showNotification('Meaning auto-filled! Review and edit if needed.', 'success');
                };

                editBtn.onclick = () => {
                    meaningInput.value = definition;
                    closeLookupModal();
                    meaningInput.focus();
                    meaningInput.select();
                };
            } else {
                throw new Error('No definition found');
            }
        } else {
            throw new Error('Word not found');
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        useBtn.style.display = 'none';
        editBtn.style.display = 'none';
        console.error('Error looking up word:', error);
    }
}

// Close lookup modal
function closeLookupModal() {
    const modal = document.getElementById('lookupModal');
    modal.style.display = 'none';
    
    // Reset modal state
    document.getElementById('lookupLoading').style.display = 'none';
    document.getElementById('lookupResult').style.display = 'none';
    document.getElementById('lookupError').style.display = 'none';
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('lookupModal');
    if (e.target === modal) {
        closeLookupModal();
    }
});

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
