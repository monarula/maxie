# 📚 Maxie - Personal Dictionary Web App

Maxie is a beautiful web application where you can build your own ever-growing personal dictionary by adding words and their meanings.

## Features

- ✨ **Add Words**: Input words and their meanings to build your dictionary
- 🔍 **Search**: Quickly search through your dictionary by word or meaning
- 💾 **Persistent Storage**: All words are saved in a JSON file and persist across sessions
- 🎨 **Modern UI**: Beautiful, responsive design that works on all devices
- 🗑️ **Delete Words**: Remove words you no longer need
- 📱 **Word of the Day Notifications**: Get daily push notifications with a random word from your dictionary (works on mobile too!)

## Getting Started

### Prerequisites

- Node.js (v14 or higher) installed on your system

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3001
```

## How to Use

1. **Add a Word**: Enter a word in the "Word" field and its meaning in the "Meaning" field, then click "Add Word"
2. **Search**: Use the search box to filter words by name or meaning
3. **Delete**: Click the "×" button on any word card to remove it from your dictionary
4. **Enable Notifications**: Click "Enable Notifications" in the notification section to receive daily Word of the Day notifications. Notifications are sent at 9 AM daily with a random word from your dictionary!

## Project Structure

```
dictionary-app/
├── server.js          # Express backend server
├── package.json       # Node.js dependencies
├── dictionary.json    # JSON file storing all words (auto-created)
├── subscriptions.json # Push notification subscriptions (auto-created)
├── public/
│   ├── index.html    # Frontend HTML
│   ├── style.css     # Styling
│   ├── app.js        # Frontend JavaScript
│   └── sw.js         # Service Worker for push notifications
└── README.md         # This file
```

## Technologies Used

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Storage**: JSON file-based storage

Enjoy building your personal dictionary! 📖
