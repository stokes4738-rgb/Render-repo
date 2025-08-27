#!/bin/bash
# Deployment Script for Pocket Bounty on Hetzner
# Run this after setup-hetzner.sh is complete

set -e

echo "==================================="
echo "Deploying Pocket Bounty"
echo "==================================="

# Configuration
APP_DIR="/var/www/pocketbounty"
REPO_URL="https://github.com/YOUR_USERNAME/pocketbounty.git" # Change this to your repo

cd "$APP_DIR"

# Clone repository (or pull if exists)
if [ ! -d ".git" ]; then
    echo "📦 Cloning repository..."
    git clone "$REPO_URL" .
else
    echo "📦 Pulling latest changes..."
    git pull origin main
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Create logs directory
mkdir -p logs

# Copy production environment file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found!"
    echo "Please copy your .env.production file to .env and fill in the values"
    exit 1
fi

# Run database migrations
echo "🗄️ Running database migrations..."
npm run db:push

# Setup PM2
echo "🚀 Starting application with PM2..."
pm2 delete pocketbounty 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER

# Configure Caddy
echo "🔒 Configuring Caddy..."
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Setup log rotation
echo "📝 Setting up log rotation..."
cat > /tmp/pocketbounty-logrotate <<EOF
$APP_DIR/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 $USER $USER
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
sudo mv /tmp/pocketbounty-logrotate /etc/logrotate.d/pocketbounty

echo "==================================="
echo "✅ Deployment complete!"
echo "==================================="
echo ""
echo "Your app should be running at:"
echo "https://pocketbounty.life"
echo ""
echo "Useful commands:"
echo "pm2 status        - Check app status"
echo "pm2 logs          - View app logs"
echo "pm2 restart all   - Restart the app"
echo "pm2 monit         - Monitor the app"
echo ""
echo "⚠️  Don't forget to:"
echo "1. Update Stripe webhook endpoint to https://pocketbounty.life/api/stripe/webhook"
echo "2. Update DNS records to point to your Hetzner server IP"
echo "3. Test all features thoroughly"