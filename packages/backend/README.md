# FocusPal Backend API

RESTful API server for FocusPal with authentication and cloud sync.

## Features

- 🔐 JWT-based authentication
- 🔄 Real-time data synchronization
- 📊 Analytics and streak tracking
- 🌐 Multi-device support
- 🔒 Secure password hashing
- 🚀 Rate limiting and security middleware
- 📝 Word lookup cache management
- 🤖 AI learning data storage

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcrypt
- **Validation:** express-validator
- **Security:** helmet, cors, rate-limit

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL 12+

### Installation

1. **Setup Database:**
```bash
./setup-database.sh
```

2. **Install Dependencies:**
```bash
pnpm install
```

3. **Start Server:**
```bash
pnpm run dev
```

The server will start on `http://localhost:3000`

## API Documentation

See `../../AUTHENTICATION_CLOUD_SYNC.md` for complete API documentation.

## License

MIT
