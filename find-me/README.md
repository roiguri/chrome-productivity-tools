# Find Me

Finds photos of you on the current webpage and allows you to save them to Google Photos.

> **Note:** Unlike the other extensions in this repo, Find Me is not lightweight — it bundles the `face-api.js` library and its ML models (~19MB total) for local face detection/recognition.

## Features
- Scans `<img>` tags on the current page for faces that match your reference face.
- Runs face detection locally in your browser.
- Integrates with Google Photos to fetch a reference album and upload matched photos.
- Displays an in-page overlay with progress and found images.

## Setup
1. You will need a Google Cloud Project with the **Google Photos Library API** enabled.
2. Create an OAuth 2.0 Client ID (type: Web Application or Chrome App).
3. Open `manifest.json` and replace `REPLACE_WITH_CLIENT_ID` with your actual Client ID.
4. Load the extension in Chrome (Developer mode -> Load unpacked).

## 🔒 Privacy Implications
This extension interacts with your Google Photos data and process images on the websites you visit.
- **Local AI Processing**: Face detection and recognition are performed **entirely locally** within your browser using WebGPU/WebGL (via face-api.js).
- **No Third-Party Servers**: Images from the websites you visit are never sent to any external server for analysis.
- **Google Photos Access**: The extension requires access to your Google Photos account to read your reference album and to upload photos you select. The OAuth token is stored locally in your browser and used only to communicate directly with the Google Photos API (`https://photoslibrary.googleapis.com`).

## How to use
1. Click the extension icon.
2. Authenticate with Google.
3. Select an album containing photos of your face.
4. Click "Scan this page" to find matches.
5. Select images to upload to Google Photos or download.
