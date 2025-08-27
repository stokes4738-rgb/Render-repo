# Pocket Bounty Migration to Hetzner - Quick Start Guide

## Prerequisites
- Hetzner CX11 server with Ubuntu 22.04 LTS
- Domain pointing to your Hetzner server IP
- Access to your Replit environment variables

## Step 1: Initial Server Setup
SSH into your Hetzner server and run:
```bash
wget https://raw.githubusercontent.com/YOUR_REPO/main/deploy/setup-hetzner.sh
chmod +x setup-hetzner.sh
./setup-hetzner.sh
```

## Step 2: Clone Your Repository
```bash
cd /var/www/pocketbounty
git clone YOUR_REPOSITORY_URL .
```

## Step 3: Setup Environment Variables
```bash
cp deploy/.env.production .env
nano .env  # Edit with your actual values from Replit
```

**Important values to copy from Replit:**
- STRIPE_SECRET_KEY
- VITE_STRIPE_PUBLIC_KEY
- STRIPE_CONNECT_CLIENT_ID
- SENDGRID_API_KEY

## Step 4: Install Dependencies & Build
```bash
npm install
npm run build
```

## Step 5: Migrate Database
From your LOCAL machine (with access to both databases):
```bash
./deploy/migrate-database.sh "YOUR_REPLIT_DATABASE_URL" "postgresql://pocketbounty:password@your-hetzner-ip:5432/pocketbounty_prod"
```

## Step 6: Start Application with PM2
```bash
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions it gives
```

## Step 7: Configure Caddy
```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Step 8: Update External Services
1. **Stripe Dashboard**:
   - Add webhook endpoint: `https://pocketbounty.life/api/stripe/webhook`
   - Update redirect URLs if needed

2. **DNS Settings**:
   - Point pocketbounty.life to your Hetzner server IP
   - Add A record: `@ → YOUR_HETZNER_IP`
   - Add A record: `www → YOUR_HETZNER_IP`

## Monitoring Commands
```bash
pm2 status          # Check app status
pm2 logs            # View logs
pm2 monit           # Real-time monitoring
sudo journalctl -u caddy -f  # Caddy logs
```

## Troubleshooting
- If app crashes: `pm2 logs --err`
- If domain doesn't work: Check DNS propagation
- If database errors: Check .env DATABASE_URL
- If Stripe errors: Verify webhook secret

## Security Checklist
- [ ] Changed default database password
- [ ] Updated JWT_SECRET and SESSION_SECRET
- [ ] Firewall configured (ufw)
- [ ] SSL certificate working (Caddy handles this)
- [ ] PM2 startup configured
- [ ] Log rotation configured