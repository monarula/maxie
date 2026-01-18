const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3001;
const DICTIONARY_FILE = path.join(__dirname, 'dictionary.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

// VAPID keys (for production, generate these securely and store them safely)
// You can generate new keys using: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa40HIcIBVhI8eEO2zXt3a7s_QtR8Y_sWnRYL-srHOKyNlqeG9B2MNTz9FyHc';
const VAPID_PRIVATE_KEY = 'SJN1JT9rPABc0I5hS-8i7jxO3vV6GN8sYRpW_KZxGgA';

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize dictionary file if it doesn't exist
async function initializeDictionary() {
  try {
    await fs.access(DICTIONARY_FILE);
  } catch (error) {
    // File doesn't exist, create it with empty array
    await fs.writeFile(DICTIONARY_FILE, JSON.stringify([], null, 2));
  }
}

// Initialize subscriptions file if it doesn't exist
async function initializeSubscriptions() {
  try {
    await fs.access(SUBSCRIPTIONS_FILE);
  } catch (error) {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify([], null, 2));
  }
}

// Read subscriptions from file
async function readSubscriptions() {
  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading subscriptions:', error);
    return [];
  }
}

// Write subscriptions to file
async function writeSubscriptions(subscriptions) {
  try {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing subscriptions:', error);
    return false;
  }
}

// Read dictionary from file
async function readDictionary() {
  try {
    const data = await fs.readFile(DICTIONARY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading dictionary:', error);
    return [];
  }
}

// Write dictionary to file
async function writeDictionary(dictionary) {
  try {
    await fs.writeFile(DICTIONARY_FILE, JSON.stringify(dictionary, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing dictionary:', error);
    return false;
  }
}

// API Routes

// Get all words
app.get('/api/words', async (req, res) => {
  try {
    const dictionary = await readDictionary();
    res.json(dictionary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve dictionary' });
  }
});

// Add a new word
app.post('/api/words', async (req, res) => {
  try {
    const { word, meaning } = req.body;
    
    if (!word || !meaning) {
      return res.status(400).json({ error: 'Word and meaning are required' });
    }

    const dictionary = await readDictionary();
    
    // Check if word already exists
    const existingIndex = dictionary.findIndex(
      entry => entry.word.toLowerCase() === word.toLowerCase()
    );

    if (existingIndex !== -1) {
      // Update existing word
      dictionary[existingIndex].meaning = meaning;
      dictionary[existingIndex].updatedAt = new Date().toISOString();
    } else {
      // Add new word
      dictionary.push({
        id: Date.now().toString(),
        word: word.trim(),
        meaning: meaning.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    await writeDictionary(dictionary);
    res.json({ success: true, dictionary });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add word' });
  }
});

// Delete a word
app.delete('/api/words/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dictionary = await readDictionary();
    const filtered = dictionary.filter(entry => entry.id !== id);
    
    await writeDictionary(filtered);
    res.json({ success: true, dictionary: filtered });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete word' });
  }
});

// Search words
app.get('/api/words/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.json([]);
    }

    const dictionary = await readDictionary();
    const filtered = dictionary.filter(entry => 
      entry.word.toLowerCase().includes(query.toLowerCase()) ||
      entry.meaning.toLowerCase().includes(query.toLowerCase())
    );
    
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search words' });
  }
});

// Get VAPID public key
app.get('/api/notifications/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to notifications
app.post('/api/notifications/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    const subscriptions = await readSubscriptions();
    
    // Check if subscription already exists
    const existingIndex = subscriptions.findIndex(
      sub => sub.endpoint === subscription.endpoint
    );

    if (existingIndex === -1) {
      subscriptions.push({
        ...subscription,
        subscribedAt: new Date().toISOString()
      });
      await writeSubscriptions(subscriptions);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from notifications
app.post('/api/notifications/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const subscriptions = await readSubscriptions();
    const filtered = subscriptions.filter(sub => sub.endpoint !== endpoint);
    await writeSubscriptions(filtered);

    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Send word of the day notification
async function sendWordOfTheDay() {
  try {
    const dictionary = await readDictionary();
    
    if (dictionary.length === 0) {
      console.log('Dictionary is empty, skipping notification');
      return;
    }

    // Get a random word
    const randomWord = dictionary[Math.floor(Math.random() * dictionary.length)];
    
    const subscriptions = await readSubscriptions();
    const payload = JSON.stringify({
      title: `📚 Word of the Day: ${randomWord.word}`,
      body: randomWord.meaning,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        url: '/',
        word: randomWord.word
      }
    });

    const promises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
        console.log(`Notification sent to ${subscription.endpoint}`);
      } catch (error) {
        console.error(`Error sending notification:`, error);
        // Remove invalid subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          const currentSubs = await readSubscriptions();
          const filtered = currentSubs.filter(sub => sub.endpoint !== subscription.endpoint);
          await writeSubscriptions(filtered);
        }
      }
    });

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('Error sending word of the day:', error);
  }
}

// Schedule daily notifications (send at 9 AM every day)
function scheduleDailyNotifications() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // 9 AM

  const msUntilTomorrow = tomorrow.getTime() - now.getTime();

  setTimeout(() => {
    sendWordOfTheDay();
    // Schedule next day
    setInterval(() => {
      sendWordOfTheDay();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntilTomorrow);

  console.log(`Next notification scheduled for ${tomorrow.toLocaleString()}`);
}

// Initialize and start server
async function startServer() {
  await initializeDictionary();
  await initializeSubscriptions();
  
  // Start daily notification scheduler
  scheduleDailyNotifications();
  
  app.listen(PORT, () => {
    console.log(`Dictionary app server running at http://localhost:${PORT}`);
    console.log('Word of the Day notifications are scheduled!');
  });
}

startServer();
