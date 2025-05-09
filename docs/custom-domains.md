# Custom Domains & SSL

## 🎉 Custom Domains Made Simple

Want your own domain? Just add it—DialUpDeploy and Caddy do the rest.

- **Automatic SSL**: Caddy issues and renews certificates for you (wildcard, too)
- **No manual config**: Add your domain, update DNS, and you're done

---

## 🏷️ Setting a Custom Domain

1. Point your domain's DNS (A or CNAME) to your server's IP
2. In your site's `config.json`, add:
   ```json
   {
     "customDomain": "yourdomain.com"
   }
   ```
3. Restart the server with `deploy start`

Caddy will automatically request and install a valid SSL certificate for your domain. No Let's Encrypt wrangling, no certbot, no drama.

---

## 🔄 Updating Your Domain

1. Edit `.env` and update `PROJECT_DOMAIN=yourdomain.com`
2. Update your Caddyfile:
   ```bash
   deploy caddyfile update
   ```
3. Restart the app:
   ```bash
   sudo systemctl restart flexiweb
   ```
4. Update your DNS settings for the new domain

---

## 🪄 How Does the Magic Work?

DialUpDeploy uses [Caddy](https://caddyserver.com/) under the hood. Caddy:

- Detects new domains and requests SSL certificates automatically
- Handles renewals, wildcard certs, and all the edge cases
- Reloads config on the fly—no downtime

When you run `deploy caddyfile update`, the system:

1. Generates a new Caddyfile based on your domain settings
2. Writes it to the proper location
3. Reloads Caddy without downtime

You get HTTPS for every site and subdomain, with zero manual steps.

---

## 🧪 Development Domains

- By default, dev mode uses `.dev.flexi` or `.nip.io` for local testing
- You can use any domain you control in production

---

## 🛑 Troubleshooting

- Make sure your DNS is pointed at your server before restarting
- If you change domains, always update your DNS and restart the app
