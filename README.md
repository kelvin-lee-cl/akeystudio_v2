# Cantonese Lyric Generator

A web application that transforms numeric patterns into Cantonese lyrics using tone mapping and AI-powered lyric generation.

## Features

- **Input Validation**: Accepts only digits 0, 2, 3, 4 (2-3 digits)
- **Tone Mapping**: Automatically maps digits to Cantonese tones:
  - `0` → Tone 4
  - `2` → Tones 6, 9
  - `3` → Tones 1, 2, 7
  - `4` → Tones 3, 5, 8
- **Pattern Generation**: Generates all possible tone combinations
- **AI-Powered Lyrics**: Uses Deepseek API to generate matching Cantonese phrases
- **Beautiful UI**: Modern, responsive design with gradient styling

## Usage

### Important: Use a Local Server

Due to CORS restrictions, you **must** run this through a local web server, not by opening the HTML file directly.

**Option 1: Python HTTP Server**
```bash
cd /path/to/akeystudio_v2
python3 -m http.server 8000
```
Then open: http://localhost:8000

**Option 2: Node.js HTTP Server**
```bash
npx http-server -p 8000
```

**Option 3: VS Code Live Server**
- Install "Live Server" extension
- Right-click `index.html` → "Open with Live Server"

**Option 4: Nginx (port 8080)**

If you see "Welcome to nginx" on port 8080, nginx is serving its default page. To serve this app instead:

1. Use the project’s `nginx.conf` (it points `root` at this folder and listens on 8080).
2. Either run nginx with this config:
   ```bash
   nginx -c "$(pwd)/nginx.conf"
   ```
   or copy the `server { ... }` block from `nginx.conf` into your main nginx config (e.g. `/etc/nginx/sites-available/default` or `/usr/local/etc/nginx/nginx.conf`), then reload:
   ```bash
   sudo nginx -s reload
   ```
3. If another server is already using 8080, change the port in `nginx.conf` or stop that server first.

Then open: http://localhost:8080

### Testing

1. First, open `test.html` in your browser (after starting a server) to verify:
   - DOM elements are loaded
   - Pattern generation works
   - API connection is successful

2. Then use the main app:
   - Enter 2-3 digits using only: 0, 2, 3, 4
   - Click "Generate Lyrics"
   - View results with tone patterns and generated phrases
   - Copy JSON output if needed

**Note**: Generating lyrics for many patterns (e.g., "334" = 27 patterns) will make multiple API calls and may take some time.

## Example Inputs

- `334` - 3-digit input generating 27 tone patterns
- `00` - 2-digit input generating 1 tone pattern (4 4)
- `23` - 2-digit input generating 6 tone patterns

## Response Format

The application returns structured JSON data including:
- Input validation information
- Digit-to-tone mappings
- All generated tone patterns
- Matching Cantonese phrases with Jyutping for each pattern

## Caching System

The app includes a **smart caching system** to avoid unnecessary API calls:

1. **Pre-generated Cache (`lyrics-cache.json`)**: 
   - Contains pre-generated lyrics for common inputs
   - Loaded automatically when the app starts
   - You can add more entries to this file manually

2. **Runtime Cache**:
   - Newly generated lyrics are automatically saved to cache
   - Cached in both memory and browser localStorage
   - Persists across page refreshes

3. **Cache Priority**:
   - First checks in-memory cache
   - Then checks localStorage
   - Then checks `lyrics-cache.json` file
   - If not found, generates new lyrics via API

**To add pre-generated lyrics:**
- Edit `lyrics-cache.json`
- Add entries using the input as the key (e.g., `"334"`)
- Follow the same JSON structure as existing entries

## Technical Details

- **Frontend**: Pure JavaScript (no frameworks)
- **API**: Deepseek Chat API
- **Caching**: JSON file + localStorage
- **Styling**: Modern CSS with gradients and responsive design

## Files

- `index.html` - Main HTML structure
- `app.js` - JavaScript logic and API integration
- `style.css` - Styling and responsive design
- `lyrics-cache.json` - Pre-generated lyrics cache

## API Configuration

The Deepseek API key is configured in `app.js`. Make sure you have valid API access.

