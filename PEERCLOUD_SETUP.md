# PeerCloud Setup Guide

## ✅ Quick Start: No Setup Needed!
Quide automatically uses **PeerCloud** (cloud.peerjs.com) - the free, official PeerJS cloud service. No custom server setup required!

## Default Configuration
The app comes pre-configured and ready to use:
- **Server**: cloud.peerjs.com (PeerJS official cloud service) ✅ DEFAULT
- **Protocol**: HTTPS/WSS (secure)
- **API Key**: peerjs (default)
- **Cost**: FREE tier included

**To get started**: Just configure TURN credentials and run the app!

## Required: TURN Credentials
For reliable cross-network calls, configure ExpressTURN credentials:

1. Get free TURN credentials: https://expressturn.com/
2. Add to `.env` or `.env.peercloud`:
   ```env
   VITE_TURN_USERNAME=your_username
   VITE_TURN_CREDENTIAL=your_credential
   ```

## ICE Server Stack
The app includes automatic NAT traversal with TURN relay:
- **STUN**: Google STUN servers (for direct peer connections)
- **TURN**: ExpressTURN (for relay when direct connection fails)

## Development
For development, just run:
```bash
pnpm install
pnpm dev
```

No server setup needed! PeerCloud handles all signaling.

## Production: Your Options

### Option 1: Keep Using PeerCloud (Recommended for MVP) ✅
- No infrastructure to manage
- Officially maintained by PeerJS team
- Free tier available
- Reliable for most use cases

**Setup**: Use the default configuration (no action needed).

### Option 2: Self-Hosted PeerServer (Optional for Enterprise)
Only if you need custom control or higher limits:

1. Install server dependencies:
   ```bash
   cd server
   pnpm install
   ```

2. Create server `.env`:
   ```env
   PORT=9000
   HOST=your-domain.com
   PEERJS_KEY=your-api-key
   PROXIED=true
   ```

3. Update client `.env`:
   ```env
   VITE_PEER_SERVER_HOST=your-domain.com
   VITE_PEER_SERVER_PORT=443
   VITE_PEER_SERVER_SECURE=true
   VITE_PEER_SERVER_KEY=your-api-key
   ```

4. Deploy and run server

### Option 3: Upgrade PeerCloud Plan
Visit https://peerjs.com for commercial plans with:
- Custom API keys
- Higher connection limits
- Priority support

## Testing Calls
1. Open app in two browsers/devices
2. Send friend request between accounts
3. Initiate voice or video call
4. Verify audio and video streams connect

## Troubleshooting

### Calls won't connect
- ✅ Make sure TURN credentials are configured
- Check browser console for errors
- Verify firewall allows WebRTC
- Test PeerCloud status: https://cloud.peerjs.com

### No audio/video
- Grant microphone/camera permissions
- Check device settings in browser
- Verify constraints in `webrtc-config.js`

### High latency
- Check network connection quality
- PeerCloud adds ~50-100ms typical
- If critical: consider self-hosted option

## Environment Variables Reference

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `VITE_PEER_SERVER_HOST` | cloud.peerjs.com | No | Change only for custom server |
| `VITE_PEER_SERVER_PORT` | 443 | No | Change only for custom server |
| `VITE_PEER_SERVER_SECURE` | true | No | Change only for custom server |
| `VITE_PEER_SERVER_KEY` | peerjs | No | Change only for custom server |
| `VITE_TURN_USERNAME` | (empty) | **YES** | Get from expressturn.com |
| `VITE_TURN_CREDENTIAL` | (empty) | **YES** | Get from expressturn.com |
```env
PORT=9000
HOST=your-domain.com
PEERJS_KEY=your-api-key
PROXIED=true  # if behind reverse proxy
```

3. Update `.env.peercloud`:
```env
VITE_PEER_SERVER_HOST=your-domain.com
VITE_PEER_SERVER_PORT=443
VITE_PEER_SERVER_SECURE=true
VITE_PEER_SERVER_KEY=your-api-key
```

4. Run server:
```bash
npm start
```

### Option 3: Upgrade PeerCloud
Visit https://peerjs.com for commercial plans with:
- Custom API keys
- Higher connection limits
- Priority support

## Testing Calls
1. Open app in two browsers
2. Send friend request between accounts
3. Initiate video/audio call
4. Verify both audio and video streams connect

## Troubleshooting

### Calls won't connect
- Check browser console for errors
- Verify firewall allows WebRTC
- Test TURN servers separately
- Check PeerCloud status at https://cloud.peerjs.com

### No audio/video
- Grant microphone/camera permissions
- Check device settings in browser
- Verify constraints in `webrtc-config.js`

### High latency
- Check network connection
- PeerCloud adds ~50-100ms
- Consider self-hosted server for production

## Current Setup Status
✅ Type-checked and building
✅ PeerCloud configured
✅ TURN servers configured (ExpressTURN)
✅ Ready for development/testing
