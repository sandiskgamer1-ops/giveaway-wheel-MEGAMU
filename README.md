# Giveaway Wheel – MEGAMU Edition

## ❤️ Support the project

If this tool helps your streams, you can support future updates:

<p align="center">
  <a href="https://paypal.me/josethemou">
    <img src="https://img.shields.io/badge/Donate%20via-PayPal-ffdd00?style=for-the-badge&logo=paypal&logoColor=black">
  </a>
</p>

A lightweight giveaway wheel designed for Twitch streams, focused on simplicity, transparency support for OBS, and fast interaction during live events.

This tool was built to manage chat giveaways without interrupting the stream layout.

---

## Features

* 🎯 Twitch chat participation system
* 🎥 Stream Mode (transparent window for OBS)
* 🖥 Normal desktop mode
* 🌍 Multi-language support
* 🏆 Prize roulette system
* 📜 Winner history tracking
* ⚡ Automatic prize refresh from MEGAMU API
* 🔒 Local configuration storage
* 🧩 Works as standalone desktop app

---

## How it works

Participants join directly from Twitch chat using a command (example: `!join`).
The app collects users, applies weighted chances (VIP / Subscribers), and performs animated draws for both winners and prizes.

Designed to run alongside OBS without occupying stream space.

---

## Installation

### Windows

Download the `.exe` from the **Releases** section and run the installer.

### Linux

Download the `.AppImage`, then:

```bash
chmod +x GiveawayWheel.AppImage
./GiveawayWheel.AppImage
```

---

## First Setup

Open **Settings** inside the app and configure:

* Twitch OAuth token
* Twitch channel name
* Participation command
* MEGAMU DV
* API Key

Settings are saved automatically in your user directory.

---

## Stream Mode

Stream Mode enables window transparency so the wheel can be captured cleanly in OBS.

Toggle it from the top bar:

```
Normal Mode ↔ Stream Mode
```

---

## Building from source

Requirements:

* Node.js
* npm
* Electron

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm start
```

Build:

```bash
npm run build:win
npm run build:linux
```

Output files appear inside:

```
/dist
```

---

## Project Structure

```
assets/        UI assets
locales/       language files
main.js        Electron main process
renderer.js    app logic
index.html     UI layout
```

---

## Notes

* Configuration files are stored outside the app to survive updates.
* The application does not store Twitch credentials remotely.
* Designed primarily for live streaming environments.

---

## Known Limitations

* Requires valid Twitch OAuth.
* Linux AppImage may need execution permission.
* Transparent mode depends on compositor support.

---

## License

Personal and streaming use allowed.
Modification permitted for private use.

---

## Author

Made by **josethemou**

If you use it on stream, feel free to credit — appreciated but not required.
