#!/bin/bash
# Database migration script for Render

echo "Starting database migration..."

# Run Drizzle migrations
npx drizzle-kit push

echo "Migration completed successfully!"