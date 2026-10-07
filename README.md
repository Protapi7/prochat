# 🚀 ProChat - 24/7 Live Encrypted Messenger & Gemini AI

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Protapi7/prochat)
[![Deploy to GitHub Pages](https://github.com/Protapi7/prochat/actions/workflows/deploy.yml/badge.svg)](https://github.com/Protapi7/prochat/actions/workflows/deploy.yml)
[![24/7 Cloud Keep-Alive](https://github.com/Protapi7/prochat/actions/workflows/keep-alive.yml/badge.svg)](https://github.com/Protapi7/prochat/actions/workflows/keep-alive.yml)

ProChat is a modern, full-stack, real-time messaging web app with **End-to-End Encryption (E2EE)**, **Mobile Number & Email ID Authentication**, **Google Gemini AI Integration**, and **Zero-Config 24/7 Cloud Hosting**.

---

## 🌐 Live Access

- **Frontend (GitHub Pages)**: [https://Protapi7.github.io/prochat/](https://Protapi7.github.io/prochat/)
- **Fullstack Cloud Backend (Render)**: [https://render.com/deploy?repo=https://github.com/Protapi7/prochat](https://render.com/deploy?repo=https://github.com/Protapi7/prochat)

---

## ⚡ How to Make it 24/7 Live in 60 Seconds (No Local PC Needed)

### Step 1: Click the Deploy to Render Button
Click the button below to launch your free 24/7 cloud server:

👉 **[Deploy ProChat to Render for FREE](https://render.com/deploy?repo=https://github.com/Protapi7/prochat)**

1. Sign in to [Render](https://dashboard.render.com/) with your GitHub account (`Protapi7`).
2. Click **Apply** / **Create Web Service**.
3. Render will build and launch your live WebSocket & Node server in 1 minute!
4. You will get your public HTTPS URL (e.g. `https://prochat-xxxx.onrender.com`).

---

### Step 2: 24/7 Keep-Alive Automation (Never Goes to Sleep)
- **Built-in Self-Ping**: The backend automatically pings itself every 12 minutes to keep the free cloud instance awake.
- **GitHub Actions Heartbeat**: `.github/workflows/keep-alive.yml` automatically sends a scheduled heartbeat ping every 12 minutes so your server is **100% active 24 hours a day, 7 days a week**.

---

## 📱 Features

- **🔐 End-to-End Encryption (E2EE)**: RSA-OAEP 2048-bit + AES-GCM 256-bit encryption. Private keys never touch the server.
- **📱 Mobile Number & Email Authentication**: Sign up and log in using either your Mobile Number, Email ID, or Username.
- **🤖 Built-in Gemini AI Assistant**: 1-on-1 AI chat assistant, message polishing, live translation, and chat summarization.
- **📲 PWA & Mobile App Ready**: Installable on Android & iOS home screens as a native Progressive Web App.
- **🧩 Chrome Extension**: Packaged Chrome extension for one-click access right from your browser toolbar.
- **🔄 Auto Server Pairing & QR Code**: Scan QR code to connect mobile phones or enter cloud URLs instantly.

---

## 🛠️ Local Development

```bash
# Install dependencies & build
npm run build

# Start local server
npm run start
```
