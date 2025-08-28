# PocketBounty Render Migration Runbook

## Quick Start: Dev → GitHub → Render Workflow

1. **Develop on Replit** → Make your changes
2. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. **Render auto-deploys** from main branch
4. **Monitor deployment**: https://dashboard.render.com

## Environment Variables

### Required on Render Dashboard
```
DATABASE_URL          # Auto-filled from Render PostgreSQL
JWT_SECRET           # Generate: openssl rand -base64 32
SESSION_SECRET       # Generate: openssl rand -base64 32
STRIPE_SECRET_KEY    # From Stripe Dashboard
STRIPE_WEBHOOK_SECRET # From Stripe Webhooks after setup
VITE_STRIPE_PUBLIC_KEY # From Stripe Dashboard
SENDGRID_API_KEY     # From SendGrid
CORS_ORIGIN          # https://pocketbounty.life
```

## Database Migration

### Initial Setup (One-time)
1. Render PostgreSQL is auto-provisioned via render.yaml
2. First deployment will run: `npm run db:push`
3. Verify tables: Use Render's database dashboard

### Ongoing Migrations
```bash
# On Render shell or build command
npm run db:push
```

## Stripe Webhook Configuration

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://pocketbounty.life/api/stripe/webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.failed`
   - `checkout.session.completed`
4. Copy webhook secret to Render env: `STRIPE_WEBHOOK_SECRET`

## DNS Configuration

### For pocketbounty.life
1. Get DNS records from Render Dashboard
2. Add to your DNS provider:
   - A Record: `@` → Render IP
   - CNAME: `www` → `pocketbounty.life.onrender.com`
3. SSL auto-provisions after DNS propagation

## Deployment

### Auto-Deploy from GitHub
- Commits to `main` trigger auto-deploy
- Build logs: Render Dashboard → Services → pocketbounty-web → Logs

### Manual Deploy
1. Render Dashboard → Services → pocketbounty-web
2. Click "Manual Deploy" → Select commit

### Rollback
1. Render Dashboard → Services → pocketbounty-web → Events
2. Find previous successful deploy
3. Click "Rollback to this deploy"

## Monitoring

### Health Checks
- Endpoint: `https://pocketbounty.life/healthz`
- Monitored every 30 seconds
- Auto-restart on 3 consecutive failures

### Logs
```bash
# View via Render Dashboard or CLI
render logs --service pocketbounty-web --tail
```

### Metrics
- CPU/Memory: Render Dashboard → Metrics
- Response times: Add APM tool (optional)

## Troubleshooting

### Database Connection Issues
1. Check `DATABASE_URL` format: `postgresql://user:pass@host:5432/db?sslmode=require`
2. Verify Render PostgreSQL is running
3. Check connection pooling limits

### Build Failures
1. Check Node version (requires >=20)
2. Verify all dependencies in package.json
3. Check build logs for TypeScript errors

### Runtime Errors
1. Check environment variables are set
2. Verify JWT_SECRET matches between deployments
3. Check CORS_ORIGIN matches your domain

## Cost Optimization

### Current Setup (Starter Plans)
- Web Service: $7/month
- PostgreSQL: $7/month
- **Total: $14/month**

### To Reduce Costs
1. Use free tier (auto-sleeps after 15 min inactivity)
2. Disable PR previews in render.yaml
3. Use external PostgreSQL (Neon free tier)

## Security Checklist

- [x] Environment variables in Render, not in code
- [x] HTTPS enforced
- [x] Rate limiting configured
- [x] Helmet.js for security headers
- [x] JWT secrets rotated regularly
- [x] Database uses SSL
- [x] Non-root Docker user

## Emergency Procedures

### Service Down
1. Check Render status page
2. Review recent deploys
3. Rollback if needed
4. Check health endpoint manually

### Database Issues
1. Check connection pool exhaustion
2. Review slow query logs
3. Scale database if needed
4. Contact Render support

### Key Rotation
1. Generate new secret: `openssl rand -base64 32`
2. Update in Render env vars
3. Trigger redeploy
4. Monitor for auth issues

## Contacts
- Render Support: support@render.com
- Status Page: https://status.render.com
- Your Render Dashboard: https://dashboard.render.com