#!/bin/bash

# FocusPal Database Setup Script

echo "╔═══════════════════════════════════════╗"
echo "║   FocusPal Database Setup             ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed"
    echo "Please install PostgreSQL first:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql"
    echo "  macOS: brew install postgresql"
    exit 1
fi

echo "✓ PostgreSQL found"

# Database configuration
DB_NAME="focuspal"
DB_USER="focuspal_user"
DB_PASSWORD="focuspal_password"

echo ""
echo "Creating database and user..."
echo "You may be prompted for the PostgreSQL admin password"
echo ""

# Create database and user
sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE $DB_NAME;

-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect to database and grant schema privileges
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;

\q
EOF

if [ $? -eq 0 ]; then
    echo "✓ Database and user created successfully"
else
    echo "❌ Failed to create database and user"
    exit 1
fi

# Run schema
echo ""
echo "Running database schema..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -f src/config/database.sql

if [ $? -eq 0 ]; then
    echo "✓ Database schema created successfully"
else
    echo "❌ Failed to create database schema"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file..."
    cp .env.example .env
    
    # Update database credentials in .env
    sed -i "s/DB_NAME=.*/DB_NAME=$DB_NAME/" .env
    sed -i "s/DB_USER=.*/DB_USER=$DB_USER/" .env
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    
    # Generate random JWT secrets
    JWT_SECRET=$(openssl rand -base64 32)
    JWT_REFRESH_SECRET=$(openssl rand -base64 32)
    
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET|" .env
    
    echo "✓ .env file created with secure secrets"
else
    echo ""
    echo "⚠️  .env file already exists, skipping..."
fi

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   Setup Complete!                     ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Password: $DB_PASSWORD"
echo ""
echo "Next steps:"
echo "1. Review and update .env file if needed"
echo "2. Run: pnpm install"
echo "3. Run: pnpm run dev"
echo ""
