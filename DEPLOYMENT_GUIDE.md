# FocusPal Live Deployment Guide

Complete step-by-step guide to deploy FocusPal backend and test the full application.

---

## 🎯 Deployment Options

### Option 1: Quick Local Testing (Recommended for Testing)
- Backend: Local PostgreSQL + Node.js
- Frontend: Electron app on your machine
- **Time:** 15 minutes
- **Cost:** Free

### Option 2: Cloud Deployment (Production)
- Backend: Cloud hosting (Heroku, Railway, DigitalOcean)
- Database: Managed PostgreSQL
- Frontend: Electron app connects to cloud API
- **Time:** 30-60 minutes
- **Cost:** $5-15/month

---

## 🚀 Option 1: Quick Local Testing

### Step 1: Install Prerequisites

**1.1 Install PostgreSQL:**

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql
brew services start postgresql

# Verify installation
psql --version
```

**1.2 Install Node.js and pnpm:**

```bash
# Check if already installed
node --version  # Should be 18+
pnpm --version

# If not installed:
# Install Node.js from https://nodejs.org/
# Install pnpm
npm install -g pnpm
```

### Step 2: Setup Database

**2.1 Run the automated setup script:**

```bash
cd packages/backend
chmod +x setup-database.sh
./setup-database.sh
```

This script will:
- Create PostgreSQL database `focuspal`
- Create user `focuspal_user`
- Run database schema
- Generate secure JWT secrets
- Create `.env` file

**2.2 Manual setup (if script fails):**

```bash
# Login to PostgreSQL
sudo -u postgres psql

# Create database and user
CREATE DATABASE focuspal;
CREATE USER focuspal_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE focuspal TO focuspal_user;
\c focuspal
GRANT ALL ON SCHEMA public TO focuspal_user;
\q

# Run schema
cd packages/backend
PGPASSWORD=your_secure_password psql -U focuspal_user -d focuspal -f src/config/database.sql

# Create .env file
cp .env.example .env
nano .env  # Edit with your credentials
```

**2.3 Verify database setup:**

```bash
# Connect to database
PGPASSWORD=your_secure_password psql -U focuspal_user -d focuspal

# List tables
\dt

# You should see:
# - users
# - devices
# - tasks
# - task_history
# - streaks
# - settings
# - word_lookup_cache
# - refresh_tokens

\q
```

### Step 3: Start Backend Server

**3.1 Install dependencies:**

```bash
cd packages/backend
pnpm install
```

**3.2 Start server:**

```bash
# Development mode (with auto-reload)
pnpm run dev

# You should see:
# ╔═══════════════════════════════════════╗
# ║   FocusPal Backend API Server         ║
# ║   Port: 3000                          ║
# ║   Environment: development            ║
# ╚═══════════════════════════════════════╝
```

**3.3 Test API health:**

Open another terminal:

```bash
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2024-04-03T...","uptime":...}
```

### Step 4: Start Desktop App

**4.1 Install dependencies:**

```bash
cd packages/desktop
pnpm install
```

**4.2 Start app:**

```bash
pnpm run dev
```

The app should launch and show the authentication window.

### Step 5: Test the Application

**5.1 Create an account:**
1. Click "Create Account"
2. Enter email: `test@example.com`
3. Enter password: `testpassword123`
4. Enter display name: `Test User`
5. Click "Create Account"

**5.2 Verify registration:**

```bash
# Check database
PGPASSWORD=your_secure_password psql -U focuspal_user -d focuspal

SELECT id, email, display_name, created_at FROM users;

# You should see your test user
\q
```

**5.3 Test core features:**
- [ ] Create a task
- [ ] Complete a task
- [ ] Check analytics
- [ ] Test word lookup
- [ ] Test pomodoro timer
- [ ] Test focus mode
- [ ] Check AI insights
- [ ] Logout and login again

**5.4 Test sync:**
- [ ] Create tasks
- [ ] Close app
- [ ] Reopen app
- [ ] Verify tasks are still there (synced from cloud)

---

## 🌐 Option 2: Cloud Deployment

### Recommended: Railway.app (Easiest)

**Why Railway?**
- Free tier available
- Automatic PostgreSQL setup
- Easy deployment
- Built-in monitoring

### Step 1: Prepare Backend for Deployment

**1.1 Create production build script:**

```bash
cd packages/backend
```

Add to `package.json`:

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "build": "echo 'No build needed for Node.js'"
  }
}
```

**1.2 Create `.gitignore` (if not exists):**

```bash
cat > .gitignore << 'EOF'
node_modules/
.env
*.log
.DS_Store
EOF
```

### Step 2: Deploy to Railway

**2.1 Install Railway CLI:**

```bash
npm install -g @railway/cli
```

**2.2 Login to Railway:**

```bash
railway login
```

**2.3 Initialize project:**

```bash
cd packages/backend
railway init
```

**2.4 Add PostgreSQL:**

```bash
railway add postgresql
```

**2.5 Set environment variables:**

```bash
# Railway will auto-set DATABASE_URL
# Set other variables:
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway variables set JWT_REFRESH_SECRET=$(openssl rand -base64 32)
railway variables set NODE_ENV=production
railway variables set CORS_ORIGIN=*
```

**2.6 Update database connection:**

Edit `packages/backend/src/config/database.js`:

```javascript
const { Pool } = require('pg');

// Use Railway's DATABASE_URL or individual credentials
const pool = new Pool(
  process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'focuspal',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      }
);

// ... rest of the code
```

**2.7 Deploy:**

```bash
railway up
```

**2.8 Run database migrations:**

```bash
# Get database URL
railway variables get DATABASE_URL

# Run schema
psql $DATABASE_URL -f src/config/database.sql
```

**2.9 Get your API URL:**

```bash
railway domain
# Example: focuspal-backend.up.railway.app
```

### Step 3: Update Desktop App

**3.1 Update API endpoint:**

Edit `packages/desktop/src/main/main.js`:

```javascript
const apiClient = new APIClient({
  baseURL: process.env.NODE_ENV === 'production'
    ? 'https://your-railway-app.up.railway.app'  // Your Railway URL
    : 'http://localhost:3000'
});
```

**3.2 Test with cloud backend:**

```bash
cd packages/desktop
NODE_ENV=production pnpm run dev
```

---

## 🔧 Alternative: DigitalOcean App Platform

### Step 1: Create DigitalOcean Account

1. Go to https://www.digitalocean.com/
2. Sign up (get $200 credit for 60 days)
3. Create new project

### Step 2: Create Managed Database

1. Click "Create" → "Databases"
2. Choose PostgreSQL
3. Select smallest plan ($15/month, or free with credits)
4. Choose region closest to you
5. Create database
6. Note connection details

### Step 3: Setup Database

```bash
# Connect to DigitalOcean database
psql "postgresql://username:password@host:port/database?sslmode=require"

# Run schema
\i packages/backend/src/config/database.sql

\q
```

### Step 4: Deploy Backend

1. Click "Create" → "Apps"
2. Connect GitHub repository
3. Select `packages/backend` directory
4. Set environment variables:
   - `DB_HOST`: Your database host
   - `DB_PORT`: 25060
   - `DB_NAME`: defaultdb
   - `DB_USER`: doadmin
   - `DB_PASSWORD`: Your database password
   - `JWT_SECRET`: Generate with `openssl rand -base64 32`
   - `JWT_REFRESH_SECRET`: Generate with `openssl rand -base64 32`
   - `NODE_ENV`: production
5. Deploy

---

## 🧪 Testing Checklist

### Backend API Tests

```bash
# Set your API URL
API_URL="http://localhost:3000"  # or your cloud URL

# 1. Health check
curl $API_URL/health

# 2. Register user
curl -X POST $API_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "displayName": "Test User"
  }'

# Save the accessToken from response

# 3. Login
curl -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123"
  }'

# 4. Get profile (replace TOKEN with your accessToken)
curl $API_URL/api/user/profile \
  -H "Authorization: Bearer TOKEN"

# 5. Create task
curl -X POST $API_URL/api/tasks \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Task",
    "startTime": "09:00",
    "endTime": "10:00",
    "priority": "high"
  }'

# 6. Get tasks
curl $API_URL/api/tasks \
  -H "Authorization: Bearer TOKEN"
```

### Desktop App Tests

**Manual Testing:**

1. **Authentication:**
   - [ ] Register new user
   - [ ] Login with credentials
   - [ ] Logout
   - [ ] Login again

2. **Tasks:**
   - [ ] Create task
   - [ ] Edit task
   - [ ] Delete task
   - [ ] Complete task
   - [ ] Create recurring task

3. **Sync:**
   - [ ] Create task
   - [ ] Close app
   - [ ] Reopen app
   - [ ] Verify task exists

4. **Offline Mode:**
   - [ ] Disconnect internet
   - [ ] Try to create task (should queue)
   - [ ] Reconnect internet
   - [ ] Verify task syncs

5. **Features:**
   - [ ] Word lookup
   - [ ] Pomodoro timer
   - [ ] Focus mode
   - [ ] Analytics
   - [ ] AI insights
   - [ ] Audio settings

---

## 🐛 Troubleshooting

### Backend Issues

**"Database connection failed":**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check credentials in .env
cat packages/backend/.env

# Test connection manually
psql -U focuspal_user -d focuspal
```

**"Port 3000 already in use":**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 pnpm run dev
```

**"JWT token errors":**
```bash
# Regenerate secrets
openssl rand -base64 32

# Update .env file
nano packages/backend/.env
```

### Frontend Issues

**"Cannot connect to API":**
- Check backend is running: `curl http://localhost:3000/health`
- Check API URL in main.js
- Check CORS settings in backend

**"Authentication failed":**
- Clear electron-store: Delete `~/.config/focuspal/` (Linux) or `~/Library/Application Support/focuspal/` (macOS)
- Try registering new user

**"Sync not working":**
- Check network connectivity
- Check backend logs
- Verify tokens are valid

---

## 📊 Monitoring

### Backend Logs

```bash
# Development
tail -f packages/backend/logs/api.log

# Production (Railway)
railway logs

# Production (DigitalOcean)
# View in dashboard
```

### Database Monitoring

```bash
# Connect to database
psql -U focuspal_user -d focuspal

# Check user count
SELECT COUNT(*) FROM users;

# Check task count
SELECT COUNT(*) FROM tasks;

# Check recent activity
SELECT email, last_login FROM users ORDER BY last_login DESC LIMIT 10;

# Check database size
SELECT pg_size_pretty(pg_database_size('focuspal'));
```

---

## 🔒 Security Checklist

Before going live:

- [ ] Change JWT secrets from defaults
- [ ] Use strong database password
- [ ] Enable HTTPS (Railway/DO do this automatically)
- [ ] Set CORS_ORIGIN to your domain (not *)
- [ ] Review rate limiting settings
- [ ] Enable database backups
- [ ] Set up error monitoring (Sentry)
- [ ] Review user data privacy
- [ ] Test password reset flow
- [ ] Verify token expiration works

---

## 📈 Next Steps

After successful deployment:

1. **Invite Beta Testers:**
   - Share app with 5-10 users
   - Collect feedback
   - Monitor for bugs

2. **Monitor Performance:**
   - API response times
   - Database query performance
   - Error rates
   - User activity

3. **Iterate:**
   - Fix bugs
   - Improve UX
   - Add requested features

4. **Scale:**
   - Upgrade database if needed
   - Add caching (Redis)
   - Optimize queries
   - Add CDN for assets

---

## 💰 Cost Estimates

### Free Tier (Testing)
- Railway: Free tier (500 hours/month)
- Heroku: Free tier (deprecated, use Railway)
- Local: $0

### Production (Small Scale)
- Railway: $5-10/month
- DigitalOcean: $15-20/month (with credits: free for 60 days)
- AWS/GCP: $10-30/month

### Production (Medium Scale)
- Database: $15-50/month
- Backend hosting: $10-30/month
- Monitoring: $0-20/month
- **Total:** $25-100/month

---

## 🎉 Success!

Once deployed, you should have:
- ✅ Backend API running in the cloud
- ✅ PostgreSQL database with schema
- ✅ Desktop app connecting to cloud API
- ✅ Full authentication and sync working
- ✅ All features functional

**Test URL:** `https://your-app.railway.app/health`

**Next:** Share with beta testers and gather feedback!

---

## 📞 Support

If you encounter issues:

1. Check logs: `railway logs` or backend console
2. Verify database connection
3. Test API endpoints with curl
4. Check environment variables
5. Review error messages

Common issues and solutions are in the Troubleshooting section above.

---

**Good luck with your deployment! 🚀**
