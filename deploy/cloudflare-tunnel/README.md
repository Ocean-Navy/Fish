# Serving op.fish from your own machine via Cloudflare Tunnel

Everything in this folder makes your Mac serve `https://op.fish` through a Cloudflare Tunnel: no open router ports, home IP hidden, TLS and DDoS handled at Cloudflare's edge, static assets edge-cached.

Three steps need **you** (they involve your Cloudflare login and live DNS): the `cloudflared` login, the tunnel creation, and the DNS route. Everything else is prepared here.

## 0. Pre-flight (do this first)

- **Check what op.fish serves today.** Open https://op.fish in a browser. If a deployment is live there, this setup will REPLACE it once DNS is routed — make sure that's intended, and note the current DNS records (dash.cloudflare.com → op.fish → DNS) so you can roll back.
- **Confirm op.fish is on Cloudflare DNS** (it appears as a zone in dash.cloudflare.com). If the nameservers are elsewhere, add the site in Cloudflare first and switch nameservers at your registrar (propagation can take a few hours).

## 1. Production app on the Mac (not the dev server)

Use a separate checkout so your dev tree can't leak into production:

```bash
git clone ~/Projects/opfish ~/Serve/opfish-prod   # local clone is fine
cd ~/Serve/opfish-prod
git checkout fix/ui-ux-gaps                        # or main after merge
npm ci
cp deploy/cloudflare-tunnel/env.op.fish.local.example .env.op.fish.local
open -e .env.op.fish.local                         # fill in real secrets (see notes inside)
npm run build
```

Boot-time env validation (WP3) will refuse to start production with a missing/placeholder `FISH_ADMIN_TOKEN` or `FISH_GUEST_ID_SALT` — that's working as intended.

Install the launchd service that keeps the app running on `127.0.0.1:3000`:

```bash
sed -e "s|__REPO_DIR__|$HOME/Serve/opfish-prod|g" deploy/cloudflare-tunnel/com.fish.web.plist \
  > ~/Library/LaunchAgents/com.fish.web.plist
launchctl load ~/Library/LaunchAgents/com.fish.web.plist
curl -s http://127.0.0.1:3000/api/health   # expect a healthy JSON answer
```

Binding to `127.0.0.1` matters: nothing on your network can reach the app except the tunnel.

## 2. The tunnel (your part — needs your Cloudflare login)

```bash
brew install cloudflared

cloudflared tunnel login          # opens browser: log in + pick the op.fish zone yourself
cloudflared tunnel create fish-web
# note the tunnel UUID it prints; credentials land in ~/.cloudflared/<UUID>.json

mkdir -p ~/.cloudflared
sed -e "s|__TUNNEL_UUID__|<UUID>|g" -e "s|__HOME__|$HOME|g" \
  deploy/cloudflare-tunnel/config.yml.example > ~/.cloudflared/config.yml

cloudflared tunnel route dns fish-web op.fish    # writes the CNAME — THIS is the moment op.fish switches
sudo cloudflared service install                 # launchd daemon, survives reboots
```

Verify: `cloudflared tunnel info fish-web` shows a connection, then open https://op.fish from your phone (not your home Wi-Fi) and run one Quick Catch order end to end.

## 3. Keep the Mac serving

- Prevent sleep while plugged in: `sudo pmset -c sleep 0` (revert later with `sudo pmset -c sleep 10`).
- Reboots: both services come back on their own (launchd) — but log in once if you used a LaunchAgent for the app (agents start at login; switch to a LaunchDaemon if the Mac reboots unattended).
- Logs: `tail -f /tmp/fish-web.log` and `/Library/Logs/com.cloudflare.cloudflared.err.log`.

## Safety notes

- The MLX server and fish-runner stay bound to localhost — only the web app goes through the tunnel. Never add ingress rules for :8080/:8088.
- `FISH_ADMIN_TOKEN` is now reachable from the public internet via the admin routes — make it long and random, use it only from your own terminal, rotate after public sessions (the operator runbook covers this).
- Watch the first public day: `/api/usage/summary` for traffic, your daily route budgets cap spend (`FISH_OCEAN_DEMO_DAILY_BUDGET_USD`), the kill switch is `FISH_ROUTER_KILL_SWITCH=true` + service restart.
- **Rollback:** delete the `op.fish` CNAME in Cloudflare DNS (or `cloudflared tunnel route` it elsewhere), restore the previous records you noted in step 0; `cloudflared service uninstall` removes the daemon.

## Why these steps are split

The login, tunnel creation, and DNS route involve your Cloudflare credentials and a live domain switch — credentials are yours alone to enter, and the DNS cutover is a decision to make consciously after the step-0 check. Everything mechanical around them is in this folder.
