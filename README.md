# Free Cluely Web - Browser-Based Chat

A lightweight, keyboard-friendly web chat application. Works on any browser (desktop, tablet, mobile).

## Quick Start

### Development

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`

### Production Build

```bash
npm run build
```

Creates optimized bundle in `dist/` folder for Vercel deployment.

## Features

✅ Real-time messaging via WebSocket  
✅ Friend requests & management  
✅ Online/offline status  
✅ Chat history (persistent)  
✅ `/clear` command (clears for both users)  
✅ Mobile-friendly responsive design  
✅ Clean, modern UI  

## Configuration

### Local Development
Create `.env.local`:
```
VITE_SERVER_URL=ws://localhost:3000
```

### Production (Vercel)
Set environment variable in Vercel dashboard:
```
VITE_SERVER_URL=wss://your-backend-url.onrender.com
```

## Deployment

See [DEPLOYMENT.md](../DEPLOYMENT.md) for detailed instructions.

### TL;DR
1. Push to GitHub
2. Import to Vercel
3. Set `VITE_SERVER_URL` env var
4. Deploy!

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Tech Stack

- **Vite** - Fast build tool
- **Vanilla JavaScript** - No dependencies (except ws)
- **WebSocket** - Real-time communication
- **CSS3** - Modern styling

## Commands

### Login/Register
- Uses HTTP API (`/api/login`, `/api/register`)
- Persists user accounts on server

### Chat
- `/clear` - Clear chat (both users)
- `/online` - List online users
- `/friends` - List your friends
- `/help` - Show commands

## Performance

- **Bundle size:** ~50KB (gzipped)
- **Load time:** <1 second
- **Memory usage:** ~20-30MB
- **Works on:** 2G networks ✅

## Troubleshooting

**Connection Error?**
- Check backend is running
- Verify SERVER_URL is correct
- Check browser console for errors

**Messages not sending?**
- Make sure you've selected a friend
- Check WebSocket connection
- Verify friend is accepted

**Chat not loading?**
- Try refreshing page
- Check browser console
- Verify SERVER_URL env var

## Architecture

```
web/ (Vercel)
├── index.html      Main entry point
├── main.js         Logic & WebSocket handling
├── styles.css      Styling
├── package.json    Dependencies
└── vite.config.js  Build config

↓ WebSocket ↓

server/ (Render or Local)
├── src/server.js   Express + WebSocket server
└── package.json
```

---

Ready to chat! 🚀
