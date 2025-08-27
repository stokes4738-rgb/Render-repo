#!/bin/bash
# Database Migration Script for Pocket Bounty
# This script helps export data from Replit and import to Hetzner

set -e

echo "==================================="
echo "Pocket Bounty Database Migration"
echo "==================================="

# Configuration
REPLIT_DB_URL="$1"
HETZNER_DB_URL="$2"

if [ -z "$REPLIT_DB_URL" ] || [ -z "$HETZNER_DB_URL" ]; then
    echo "Usage: ./migrate-database.sh <REPLIT_DB_URL> <HETZNER_DB_URL>"
    echo "Example: ./migrate-database.sh 'postgresql://user:pass@host/db' 'postgresql://user:pass@localhost/db'"
    exit 1
fi

# Export from Replit database
echo "📤 Exporting data from Replit database..."
pg_dump "$REPLIT_DB_URL" \
    --no-owner \
    --no-privileges \
    --no-acl \
    --clean \
    --if-exists \
    --file=pocketbounty_backup.sql

echo "✅ Database exported to pocketbounty_backup.sql"

# Import to Hetzner database
echo "📥 Importing data to Hetzner database..."
psql "$HETZNER_DB_URL" < pocketbounty_backup.sql

echo "✅ Database migration complete!"
echo ""
echo "Next steps:"
echo "1. Verify data integrity in the new database"
echo "2. Update your .env file with the new DATABASE_URL"
echo "3. Test the application thoroughly"

# Optional: Create backup
echo "💾 Creating backup archive..."
tar -czf pocketbounty_backup_$(date +%Y%m%d_%H%M%S).tar.gz pocketbounty_backup.sql
rm pocketbounty_backup.sql

echo "✅ Backup saved with timestamp"