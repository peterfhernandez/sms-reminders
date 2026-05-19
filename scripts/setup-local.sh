#!/bin/bash
# ============================================================
# SMS REMINDERS — Local Dev Setup Script
# Run this once after cloning the repo: bash scripts/setup-local.sh
# ============================================================

set -e  # Exit on any error

echo ""
echo "🚀 Setting up SMS Reminders local dev environment..."
echo ""

# --- Check Node.js ---
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js 20+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d. -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js 20+ required. Current: $(node -v). Please upgrade."
  exit 1
fi
echo "✅ Node.js $(node -v)"

# --- Check npm ---
echo "✅ npm $(npm -v)"

# --- Check Supabase CLI ---
if ! command -v supabase &> /dev/null; then
  echo ""
  echo "⚠️  Supabase CLI not found. Installing via npm..."
  npm install -g supabase
fi
echo "✅ Supabase CLI $(supabase --version)"

# --- Install dependencies ---
echo ""
echo "📦 Installing npm dependencies..."
npm install

# --- Setup .env.local ---
if [ ! -f ".env.local" ]; then
  echo ""
  echo "📝 Creating .env.local from template..."
  cp .env.example .env.local
  echo "⚠️  Please edit .env.local and fill in your Supabase keys."
else
  echo "✅ .env.local already exists (skipping)"
fi

# --- Start Supabase locally ---
echo ""
echo "🗄️  Starting local Supabase (Docker required)..."
echo "   If Docker isn't running, start it first then re-run this script."
supabase start

echo ""
echo "🌱 Applying migrations and seed data..."
supabase db reset

echo ""
echo "============================================================"
echo "✅ Local dev environment ready!"
echo ""
echo "Local Supabase Studio: http://localhost:54323"
echo "Local API:             http://localhost:54321"
echo ""
echo "Next steps:"
echo "  1. Fill in your .env.local with the Supabase keys shown above"
echo "  2. Run: npm run dev"
echo "  3. Open: http://localhost:3000"
echo "============================================================"
echo ""
