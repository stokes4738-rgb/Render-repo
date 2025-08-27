#!/bin/bash
# Hetzner Ubuntu 22.04 LTS Setup Script for Pocket Bounty
# Run this on your fresh Hetzner server

set -e

echo "==================================="
echo "Pocket Bounty Server Setup Script"
echo "==================================="

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt -y upgrade

# Install basic tools
echo "🔧 Installing basic tools..."
sudo apt -y install git curl fail2ban ufw build-essential

# Install Node.js v20
echo "📦 Installing Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs

# Install PM2 globally
echo "🚀 Installing PM2..."
sudo npm i -g pm2

# Install PostgreSQL
echo "🐘 Installing PostgreSQL..."
sudo apt -y install postgresql postgresql-contrib

# Create database and user
echo "🗄️ Setting up PostgreSQL database..."
sudo -u postgres psql <<EOF
CREATE USER pocketbounty WITH PASSWORD 'changethispassword';
CREATE DATABASE pocketbounty_prod;
GRANT ALL PRIVILEGES ON DATABASE pocketbounty_prod TO pocketbounty;
EOF

# Install Caddy
echo "🔒 Installing Caddy web server..."
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5000/tcp  # App port (temporarily, will proxy through Caddy)
sudo ufw --force enable

# Create app directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/pocketbounty
sudo chown -R $USER:$USER /var/www/pocketbounty

echo "==================================="
echo "✅ Basic setup complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository to /var/www/pocketbounty"
echo "2. Copy .env.production file with your secrets"
echo "3. Run npm install"
echo "4. Run npm run build"
echo "5. Configure Caddy with the provided Caddyfile"
echo "6. Start the app with PM2"
echo ""
echo "Database connection string:"
echo "postgresql://pocketbounty:changethispassword@localhost:5432/pocketbounty_prod"
echo ""
echo "⚠️  IMPORTANT: Change the database password immediately!"