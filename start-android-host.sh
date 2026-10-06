#!/bin/bash
# ProChat Android Auto-Server Host Script (Termux / Mobile Node.js)
echo "=================================================="
echo "🚀 ProChat Mobile Host Server Auto-Installer"
echo "=================================================="

pkg update -y && pkg install -y nodejs git

if [ ! -d "backend" ]; then
    echo "Cloning ProChat repository or navigating to backend directory..."
fi

cd backend || exit 1

echo "Installing backend dependencies..."
npm install

echo "Starting ProChat Server on Android device..."
node server.js
