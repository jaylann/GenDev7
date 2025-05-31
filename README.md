# BetterSurf Web Frontend

[![Next.js Version](https://img.shields.io/badge/next.js-15.3.2-black.svg)](https://nextjs.org/)  
[![TypeScript](https://img.shields.io/badge/typescript-5.4.2-blue.svg)](https://www.typescriptlang.org/)

---

## 📖 Table of Contents

1. 📌 [About](#about)
2. 🚀 [Features](#features)
3. 🛠️ [Prerequisites](#prerequisites)
4. 🏁 [Getting Started](#getting-started)
    - 📥 [Clone & Install](#clone-install)
    - 🔑 [Environment Variables](#environment-variables)
    - 💻 [Run Locally](#run-locally)
    - 📦 [Build & Export](#build-export)
5. 📜 [Scripts](#scripts)
6. ⚙️ [Environment Config](#environment-config)
7. 🎨 [Styling & Fonts](#styling--fonts)

---

<a id="about"></a>

## 📌 About

This is the **BetterSurf** web frontend, built on Next.js + TypeScript. It provides a sleek, responsive UI to compare internet-provider offers side-by-side, leveraging the BetterSurf backend API for data.

---

<a id="features"></a>

## 🚀 Features

- ⚡ **Next.js 15** with App Router & React 19
- 🔄 **Suspense** + React Server Components for fast loading
- 🗺️ Integrated **Google Maps Autocomplete**
- 🌙 **Gradient background**
- 🔔 Toast notifications via Sonner
- ✅ ESLint + Prettier + TypeScript type safety

---

<a id="prerequisites"></a>

## 🛠️ Prerequisites

- Node.js **18+** (LTS recommended)
- npm **10+** or Yarn **1.22+**
- Google Maps API key (for map component)
- Running instance of BetterSurf backend

---

<a id="getting-started"></a>

## 🏁 Getting Started

<a id="clone-install"></a>

### Clone & Install

```bash
# Clone the repo
git clone https://github.com/jaylann/gendev-web.git
cd gendev-web

# Install dependencies
npm install
# or
yarn install
```

### Environment Variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Run Locally

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

<a id="build-export"></a>

### Build & Export

```bash
npm run build
npm run start
# or
yarn build
yarn start
```

---

<a id="scripts"></a>

## 📜 Scripts

| Command | Description                                 |
| ------- | ------------------------------------------- |
| `dev`   | Runs Next.js in development mode (with HMR) |
| `build` | Creates an optimized production build       |
| `start` | Runs the production server                  |
| `lint`  | Runs ESLint checks                          |

---

<a id="environment-config"></a>

## ⚙️ Environment Config

- **`NEXT_PUBLIC_API_URL`**
  Base URL for the BetterSurf backend (e.g. `http://localhost:8000`).

- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`**
  API key to load Google Maps in the comparison page.

---

<a id="styling-fonts"></a>

## 🎨 Styling & Fonts

- Uses **Tailwind CSS** for utility-first styling.
- Global CSS in `src/app/globals.css`.
- Google Fonts via `next/font/google`:

    - `Geist` (sans)
    - `Geist Mono` (mono)

Dark gradient background is applied at the `<html>` level via Tailwind classes.

---

Made with ❤️ by Justin Lanfermann
