# 🚀 Step-by-Step: Deploy Maxie (Dictionary App) on Render

Follow these steps in order. If your code is already on GitHub, skip to **Step 3**.

---

## Step 1: Put Your Code on GitHub

1. Go to [github.com](https://github.com) and sign in (or create an account).
2. Click the **"+"** in the top right → **"New repository"**.
3. Set:
   - **Repository name**: `dictionary-app` or `maxie` (your choice).
   - **Description**: optional (e.g. "Personal Dictionary Web App").
   - **Visibility**: Public or Private.
   - Leave **"Add a README"** and **"Add .gitignore"** **unchecked** (this project already has them).
4. Click **"Create repository"**.

---

## Step 2: Push This Project to That Repo

In a terminal, from your project folder (e.g. `C:\temp\dictionary-app`):

**If you don’t have `git` set up here yet:**
```bash
cd C:\temp\dictionary-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git push -u origin main
```
Replace `YOUR_USERNAME` with your GitHub username and `REPO_NAME` with the repo you created (e.g. `dictionary-app`).

**If this folder is already a git repo with a remote:**
```bash
cd C:\temp\dictionary-app
git add .
git commit -m "Initial commit"   # only if there are uncommitted changes
git push -u origin main
```

---

## Step 3: Create a Web Service on Render

1. Go to [render.com](https://render.com) and sign in (or sign up with GitHub).
2. On the dashboard, click **"New +"** → **"Web Service"**.
3. **Connect GitHub** (if asked): choose your account and allow Render to access your repos.
4. In the list of repositories, find and click **your dictionary app repo** (e.g. `dictionary-app` or `maxie`).
5. Click **"Connect"** next to that repo.

---

## Step 4: Configure the Web Service

Set these exactly (leave everything else as default unless you know what you’re doing):

| Field | Value |
|-------|--------|
| **Name** | `maxie` or `dictionary-app` (this becomes the URL: `https://NAME.onrender.com`) |
| **Region** | Pick one close to you (e.g. Oregon, Ohio) |
| **Branch** | `main` |
| **Root Directory** | Leave **empty** |
| **Runtime** | **Node** |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

6. Scroll down and click **"Create Web Service"**.

---

## Step 5: Wait for the First Deploy

- Render will run `npm install`, then `npm start`.
- Watch the **Logs** tab; the first deploy usually takes 2–3 minutes.
- When you see something like **"Your service is live at https://....onrender.com"**, the app is running.
- Open that URL in your browser to use the dictionary app.

---

## Step 6 (Recommended): Add PostgreSQL So Words Persist

On the free tier, Render’s disk is temporary. Without a database, words disappear after the app restarts or sleeps (~15 min idle).

1. In the Render dashboard, click **"New +"** → **"PostgreSQL"**.
2. Name it (e.g. `maxie-db`), choose the **same region** as your web service, then **"Create Database"**.
3. When it’s ready, open the new **PostgreSQL** service → **"Info"** (or "Connect").
4. Copy the **"Internal Database URL"** (use **External** only if the DB is in a different region).
5. Go back to your **Web Service** (maxie/dictionary-app) → **"Environment"** tab.
6. Click **"Add Environment Variable"**:
   - **Key**: `DATABASE_URL`
   - **Value**: paste the URL you copied.
7. Click **"Save Changes"**. Render will redeploy; after that, words and notification subscriptions will persist.

---

## Step 7 (Optional): Push Notifications (VAPID Keys)

To get “Word of the Day” push notifications in production:

1. **Generate VAPID keys** (in your project folder):
   ```bash
   cd C:\temp\dictionary-app
   npx web-push generate-vapid-keys
   ```

2. **Update `server.js`** with the two keys it prints:
   - Replace the value of `VAPID_PUBLIC_KEY` with the **public** key.
   - Replace the value of `VAPID_PRIVATE_KEY` with the **private** key.
   - In `webpush.setVapidDetails()`, set the first argument to your email (e.g. `'mailto:you@example.com'`).

3. **Commit and push**:
   ```bash
   git add server.js
   git commit -m "Update VAPID keys for production"
   git push
   ```
   Render will redeploy automatically.

---

## ✅ You’re Done

Your app is live at **`https://YOUR-SERVICE-NAME.onrender.com`**. You can:
- Open it on any device
- Add and search words
- (If you added Postgres) Keep words across restarts
- (If you set VAPID) Enable daily push notifications

---

## 🔄 Deploying Future Changes

Whenever you change the code:

```bash
git add .
git commit -m "Short description of the change"
git push
```

Render will detect the push and redeploy the web service.

---

**Stuck?** Check the **Logs** tab on your Render Web Service for errors, or open `TROUBLESHOOTING.md` in this repo.
