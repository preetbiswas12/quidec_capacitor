# PeerJS Server (Optional)

## ⚠️ Not Required for Default Setup!

**Important**: This directory contains an optional custom PeerJS server. 

**By default, Quidec uses cloud.peerjs.com (free, managed by PeerJS team).** No custom server needed!

## When Do You Need This?

Only create a custom PeerJS server if you need:
- ✅ Self-hosted infrastructure (no reliance on external services)
- ✅ Custom API keys and connection limits
- ✅ Full control over signaling behavior
- ✅ Enterprise SLA and support

## For Most Users: Use PeerCloud ✅

The default configuration uses the free PeerCloud service:
- No setup needed
- Reliable and managed
- Works out of the box

See [PEERCLOUD_SETUP.md](../PEERCLOUD_SETUP.md) for details.

## If You Really Need a Custom Server

Only proceed if you've decided to self-host:

1. **Setup dependencies**:
   ```bash
   pnpm install
   ```

2. **Create `.env`**:
   ```env
   PORT=9000
   HOST=your-domain.com
   PEERJS_KEY=your-custom-key
   PROXIED=true
   ```

3. **Update client configuration** in `.env`:
   ```env
   VITE_PEER_SERVER_HOST=your-domain.com
   VITE_PEER_SERVER_PORT=443
   VITE_PEER_SERVER_SECURE=true
   VITE_PEER_SERVER_KEY=your-custom-key
   ```

4. **Deploy and run**:
   ```bash
   pnpm start
   ```

## Recommendation

👉 **Start with PeerCloud (default)** → Only switch to custom if you hit PeerCloud limits

---

**Current Status**: Using cloud.peerjs.com by default ✅
