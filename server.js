const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const webpush = require('web-push');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;
const DICTIONARY_FILE = path.join(__dirname, 'dictionary.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

// Use PostgreSQL when DATABASE_URL is set (e.g. on Render); otherwise use JSON files (local dev).
// Render free tier has ephemeral disk—file writes are lost on restart/sleep—so use a free Postgres DB.
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

// VAPID keys (for production, generate these securely and store them safely)
// You can generate new keys using: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'BCVaoNbyacUqc0Y5OsDYwZBxpMxs0rVMmRN0tHzz9w2KO1Bz_1vEiDELerADcIaU_2bSfuKChQWvSI0mQNMNrfU';
const VAPID_PRIVATE_KEY = '84dVOEZz_tlsyigMJUXimJtdG6wQf0cwnCHetnjsR5s';

webpush.setVapidDetails(
  'mailto:maxie@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public', {
    maxAge: '1d', // Cache static files for 1 day
    etag: true
}));

// Explicitly serve service worker with correct headers
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Initialize PostgreSQL tables (when using DATABASE_URL)
async function initDb() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS words (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        meaning TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        endpoint TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        "subscribedAt" TIMESTAMPTZ NOT NULL
      )
    `);
    console.log('PostgreSQL tables ready');
  } catch (error) {
    console.error('Failed to init DB:', error);
    throw error;
  }
}

// Initialize dictionary file if it doesn't exist (file-based mode only)
async function initializeDictionary() {
  if (pool) return;
  try {
    await fs.access(DICTIONARY_FILE);
  } catch (error) {
    await fs.writeFile(DICTIONARY_FILE, JSON.stringify([], null, 2));
  }
}

// Initialize subscriptions file if it doesn't exist (file-based mode only)
async function initializeSubscriptions() {
  if (pool) return;
  try {
    await fs.access(SUBSCRIPTIONS_FILE);
  } catch (error) {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify([], null, 2));
  }
}

// Read subscriptions (from DB or file)
async function readSubscriptions() {
  if (pool) {
    try {
      const { rows } = await pool.query('SELECT data FROM subscriptions ORDER BY "subscribedAt"');
      return rows.map(r => r.data);
    } catch (error) {
      console.error('Error reading subscriptions:', error);
      return [];
    }
  }
  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading subscriptions:', error);
    return [];
  }
}

// Write subscriptions (to DB or file)
async function writeSubscriptions(subscriptions) {
  if (pool) {
    try {
      await pool.query('DELETE FROM subscriptions');
      for (const sub of subscriptions) {
        const endpoint = sub.endpoint;
        const subscribedAt = sub.subscribedAt || new Date().toISOString();
        await pool.query(
          'INSERT INTO subscriptions (endpoint, data, "subscribedAt") VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO UPDATE SET data = $2, "subscribedAt" = $3',
          [endpoint, JSON.stringify(sub), subscribedAt]
        );
      }
      return true;
    } catch (error) {
      console.error('Error writing subscriptions:', error);
      return false;
    }
  }
  try {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing subscriptions:', error);
    return false;
  }
}

// Read dictionary (from DB or file)
async function readDictionary() {
  if (pool) {
    try {
      const { rows } = await pool.query('SELECT id, word, meaning, "createdAt", "updatedAt" FROM words ORDER BY "createdAt"');
      return rows.map(r => ({
        id: r.id,
        word: r.word,
        meaning: r.meaning,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
    } catch (error) {
      console.error('Error reading dictionary:', error);
      return [];
    }
  }
  try {
    const data = await fs.readFile(DICTIONARY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading dictionary:', error);
    return [];
  }
}

// Write dictionary (to DB or file) — full replace
async function writeDictionary(dictionary) {
  if (pool) {
    try {
      await pool.query('DELETE FROM words');
      for (const w of dictionary) {
        await pool.query(
          'INSERT INTO words (id, word, meaning, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5)',
          [w.id, w.word, w.meaning, w.createdAt, w.updatedAt]
        );
      }
      return true;
    } catch (error) {
      console.error('Error writing dictionary:', error);
      return false;
    }
  }
  try {
    await fs.writeFile(DICTIONARY_FILE, JSON.stringify(dictionary, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing dictionary:', error);
    return false;
  }
}

// Mutex to prevent race conditions when multiple requests read-modify-write simultaneously.
// Without this, rapid adds or concurrent requests can overwrite each other and lose words.
let dictionaryLock = Promise.resolve();

async function withDictionaryLock(operation) {
  const prevLock = dictionaryLock;
  let resolveLock;
  dictionaryLock = new Promise(resolve => { resolveLock = resolve; });
  try {
    await prevLock;
    return await operation();
  } finally {
    resolveLock();
  }
}

// API Routes

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all words
app.get('/api/words', async (req, res) => {
  try {
    const dictionary = await readDictionary();
    res.json(dictionary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve dictionary' });
  }
});

// Get last word added timestamp
app.get('/api/words/last-added', async (req, res) => {
  try {
    const dictionary = await readDictionary();
    
    if (dictionary.length === 0) {
      return res.json({ lastAdded: null });
    }

    // Find the most recently created word
    const lastWord = dictionary.reduce((latest, word) => {
      const wordTime = new Date(word.createdAt).getTime();
      const latestTime = latest ? new Date(latest.createdAt).getTime() : 0;
      return wordTime > latestTime ? word : latest;
    }, null);

    res.json({ lastAdded: lastWord ? lastWord.createdAt : null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve last added timestamp' });
  }
});

// Add a new word
app.post('/api/words', async (req, res) => {
  try {
    const { word, meaning } = req.body;
    
    if (!word || !meaning) {
      return res.status(400).json({ error: 'Word and meaning are required' });
    }

    const result = await withDictionaryLock(async () => {
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
      
      // Find the last added word timestamp (for newly added words)
      const lastAdded = existingIndex === -1 
        ? new Date().toISOString() 
        : dictionary.find(w => w.id === dictionary[dictionary.length - 1]?.id)?.createdAt || null;
      
      return { dictionary, lastAdded };
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add word' });
  }
});

// Delete a word
app.delete('/api/words/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filtered = await withDictionaryLock(async () => {
      const dictionary = await readDictionary();
      const result = dictionary.filter(entry => entry.id !== id);
      await writeDictionary(result);
      return result;
    });
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
  try {
    if (pool) await initDb();
    await initializeDictionary();
    await initializeSubscriptions();

    if (pool) {
      console.log('Storage: PostgreSQL — dictionary data persists across deploys and restarts.');
    } else {
      console.warn(
        'Storage: dictionary.json (file mode). On Render this data is NOT persistent. Set DATABASE_URL to use PostgreSQL.'
      );
    }
    
    // Start daily notification scheduler
    scheduleDailyNotifications();
    
    // Bind to 0.0.0.0 for Render deployment
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Dictionary app server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('Word of the Day notifications are scheduled!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
