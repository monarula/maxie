# 🔧 Troubleshooting Maxie Deployment

If your app is deployed but not working, check these common issues:

## Quick Checks

1. **Check Render Logs**
   - Go to your Render dashboard
   - Click on your service
   - Check "Logs" tab for errors
   - Look for red error messages

2. **Verify Build Success**
   - Check if build completed successfully
   - Look for "Build successful" message

3. **Check Runtime Status**
   - Service should show "Live" status
   - If it shows "Failed" or "Stopped", check logs

## Common Issues & Fixes

### Issue 1: "Cannot GET /" or Blank Page

**Problem**: Static files not loading

**Fix**: 
- Verify `public` folder exists in your repo
- Check that `express.static('public')` is in server.js
- Ensure `index.html` is in the `public` folder

### Issue 2: API Calls Failing (404 errors)

**Problem**: API endpoints not responding

**Fix**:
- Check browser console (F12) for errors
- Verify API routes are defined in server.js
- Check CORS settings

### Issue 3: Port Binding Error

**Problem**: Server not binding to correct port

**Fix**: Already fixed! Server now binds to `0.0.0.0` and uses `process.env.PORT`

### Issue 4: Auto-lookup Not Working

**Problem**: Dictionary API calls failing

**Fix**: 
- This is expected - the external API might be blocked or slow
- Users can still enter meanings manually
- Check browser console for CORS errors

### Issue 5: Notifications Not Working

**Problem**: Push notifications fail

**Fix**:
- Requires HTTPS (Render provides this automatically)
- User must enable notifications in browser
- VAPID keys must be valid (already fixed)

## Debugging Steps

1. **Test Health Endpoint**
   - Visit: `https://maxie-fmpz.onrender.com/health`
   - Should return: `{"status":"ok","timestamp":"..."}`
   - If this works, server is running

2. **Test API Endpoint**
   - Visit: `https://maxie-fmpz.onrender.com/api/words`
   - Should return: `[]` (empty array if no words)
   - If this works, API is working

3. **Check Browser Console**
   - Open your deployed app
   - Press F12 → Console tab
   - Look for red error messages
   - Share any errors you see

4. **Check Network Tab**
   - F12 → Network tab
   - Reload page
   - Check if files are loading (200 status)
   - Look for 404 or 500 errors

## What to Share for Help

If still not working, share:
1. Screenshot of Render logs (error messages)
2. Browser console errors (F12 → Console)
3. Network tab errors (F12 → Network)
4. What you see when visiting the URL

## Quick Fixes Applied

✅ Server now binds to `0.0.0.0` (required for Render)
✅ Health check endpoint added (`/health`)
✅ Better error handling in server startup
✅ PORT uses environment variable
