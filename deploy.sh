#!/bin/bash

# Simple deployment script for pushing to GitHub
# This will trigger auto-deploy on Render

echo "🚀 Starting deployment process..."

# Add all changes
git add .

# Commit with timestamp
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
git commit -m "Deploy: $TIMESTAMP" || echo "No changes to commit"

# Push to GitHub (this triggers Render auto-deploy)
git push origin main

echo "✅ Code pushed to GitHub!"
echo "📦 Render will automatically detect changes and redeploy"
echo "Check your Render dashboard for deployment status"