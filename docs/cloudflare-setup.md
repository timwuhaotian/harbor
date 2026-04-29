# Cloudflare Tunnel Setup

Use this guide to expose Harbor through a Cloudflare subdomain so V2Box can connect from anywhere without port forwarding.

## Target Architecture

```text
V2Box
  -> harbor.yourdomain.com:443
  -> Cloudflare TLS + WebSocket
  -> Cloudflare Tunnel connector on the Mac
  -> http://127.0.0.1:18080
  -> Harbor/sing-box VLESS WebSocket inbound
  -> direct outbound from the Mac
```

Cloudflare handles the public TLS certificate. Harbor does not need local TLS certificates.

## 1. Create The Tunnel

1. Open Cloudflare Dashboard.
2. Go to `Zero Trust`.
3. Go to `Networks` -> `Tunnels`.
4. Select `Create a tunnel`.
5. Choose `Cloudflared`.
6. Name it, for example `harbor-mac`.
7. Save the tunnel.

## 2. Copy The Token

Cloudflare shows an install command similar to:

```bash
cloudflared tunnel --no-autoupdate run --token <very-long-token>
```

Copy only the `<very-long-token>` value. Paste that token into Harbor's `Cloudflare tunnel token` field.

Harbor passes it as `TUNNEL_TOKEN` instead of showing it in process arguments.

## 3. Add The Public Hostname

Inside the same tunnel, open `Public Hostnames` and add:

```text
Subdomain: harbor
Domain: yourdomain.com
Path: leave blank
Type: HTTP
URL: 127.0.0.1:18080
```

Cloudflare should display the public hostname as:

```text
harbor.yourdomain.com
```

Use that exact hostname in Harbor's `Cloudflare hostname` field.

## 4. Harbor Settings

Use these defaults unless you changed them:

```text
Cloudflare hostname: harbor.chinagpt.link
WebSocket path: /harbor
Local port: 18080
sing-box command: sing-box
cloudflared command: cloudflared
```

This local build also bundles these values in `src-tauri/resources/harbor-defaults.local.json`, so Harbor should prefill the hostname and tunnel token automatically. You can still override them in the GUI before starting.

Install command-line dependencies if needed:

```bash
brew install sing-box cloudflared
```

## 5. V2Box Import

1. Start Harbor.
2. Copy the generated VLESS link or scan the QR code.
3. Import it into V2Box.
4. Connect.

The link should look like:

```text
vless://<uuid>@harbor.yourdomain.com:443?encryption=none&security=tls&type=ws&host=harbor.yourdomain.com&sni=harbor.yourdomain.com&path=%2Fharbor#Harbor-Mac
```

## 6. Cloudflare Compatibility Notes

- This requires `VLESS + WebSocket + TLS`.
- Raw VLESS TCP will not work through a normal Cloudflare Tunnel HTTP public hostname.
- `security=tls` is correct because Cloudflare terminates public TLS.
- The Cloudflare service target remains plain `http://127.0.0.1:18080`.
- The Mac must stay awake and Harbor must stay running while remote devices use it.

## 7. Troubleshooting

If V2Box cannot connect:

1. Confirm Harbor shows both `sing-box` and `cloudflared` running.
2. Confirm Cloudflare tunnel connector shows `Healthy`.
3. Confirm the public hostname service target is `http://127.0.0.1:18080`.
4. Confirm the V2Box path is `/harbor`.
5. Confirm V2Box uses WebSocket transport and TLS.
6. Check Harbor runtime logs for `sing-box` config or port errors.
