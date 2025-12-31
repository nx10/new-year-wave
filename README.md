# 🌍 New Year Wave

[![Deploy to GitHub Pages](https://github.com/nx10/new-year-wave/actions/workflows/deploy.yml/badge.svg)](https://github.com/nx10/new-year-wave/actions/workflows/deploy.yml)

**[View Live →](https://nx10.dev/new-year-wave/)**

Real-time visualization of the astronomical new year traveling across Earth. Watch solar midnight cross into the new year as it sweeps westward around the globe.

## ✨ Features

- **Real-time tracking** — Updates every second with live UTC and local time
- **Solar midnight visualization** — Shows the actual astronomical new year line
- **Find your location** — See when your solar midnight on January 1st occurs
- **Interactive map** — Hover over countries to see their solar midnight time
- **Progress tracking** — Coverage percentage and status updates
- **Responsive design** — Works on desktop, tablet, and mobile
- **Share functionality** — Easy sharing to social media

## 🌐 How It Works

This visualization tracks **solar midnight** — the moment when the sun is at its lowest point (directly opposite your location). The astronomical new year begins when solar midnight crosses into January 1st at each longitude.

**Timeline:**
- **Dec 31, 12:00 UTC** — Wave begins at the Date Line (180°)
- **Jan 1, 00:00 UTC** — Wave crosses Greenwich (0°)
- **Jan 1, 12:00 UTC** — Wave completes at the Date Line (-180°)

The wave travels **westward at ~1,670 km/h** at the equator, taking exactly 24 hours to circle the globe.

### Solar vs Timezone Midnight

- **Solar midnight**: When your location is directly opposite the sun (varies continuously by longitude)
- **Timezone midnight**: When clocks strike 12:00 AM (jumps at timezone boundaries)

For timezone-based celebrations, see [timeanddate.com's New Year Map](https://www.timeanddate.com/counters/newyearmap.html).

## 🚀 Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🛠️ Tech Stack

- **React 18** — UI framework
- **D3.js** — Map rendering and projections
- **Luxon** — Date/time handling
- **TopoJSON** — Efficient geographic data
- **Vite** — Build tool
- **Natural Earth** — Country boundary data

## 📁 Project Structure

```
new-year-wave/
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Pages deployment
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx           # Main React component
│   ├── App.css           # Styles
│   └── main.jsx          # Entry point
├── index.html
├── package.json
└── vite.config.js
```

## 📄 License

MIT License — feel free to use, modify, and share!

---

Made with ✨ for New Year celebrations worldwide