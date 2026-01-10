# Custom Domains

By default, each site gets a subdomain like `mysite.yourdomain.com`. You can also point your own domains at specific sites.

---

## How It Works

Deploy uses Caddy as a reverse proxy. Caddy automatically:
- Requests SSL certificates from Let's Encrypt
- Renews certificates before they expire
- Handles HTTPS redirects

All you need to do is point your DNS and Deploy handles the rest.

---

## Adding a Custom Domain

### 1. Point DNS to Your Server

Add an A record for your custom domain:

```
A     @     →  your.server.ip
```

Or for a subdomain:

```
A     blog  →  your.server.ip
```

### 2. Configure in Dashboard

1. Click on the site you want to use the custom domain
2. Go to **Settings**
3. Add your custom domain (coming soon - currently requires manual Caddyfile edit)

### 3. Manual Caddyfile Configuration

Until the dashboard supports custom domains directly, edit the Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
```

Add a block for your custom domain:

```
mycustomdomain.com {
    reverse_proxy localhost:8001
}
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

Find the port by checking the site in the dashboard or running:

```bash
docker ps | grep sitename
```

---

## Wildcard Subdomains

Your main domain already has wildcard support. Any subdomain automatically routes to the site with that name:

- `blog.yourdomain.com` → site named "blog"
- `api.yourdomain.com` → site named "api"
- `staging.yourdomain.com` → site named "staging"

---

## SSL Certificates

Caddy handles certificates automatically:

- **Initial request**: When a domain is first accessed, Caddy requests a certificate
- **Renewal**: Certificates are renewed automatically before expiration
- **Wildcard**: Your main domain uses a wildcard certificate for all subdomains

### Cloudflare Users

If you're using Cloudflare:

1. Set DNS records to "DNS only" (gray cloud) initially
2. Wait for Caddy to obtain certificates
3. Then you can enable Cloudflare proxying (orange cloud) if desired

If you enable Cloudflare proxying before Caddy gets certificates, the certificate request will fail.

---

## Troubleshooting

### Certificate not working

1. Check DNS is pointing correctly: `nslookup yourdomain.com`
2. Check Caddy logs: `sudo journalctl -u caddy -f`
3. Make sure ports 80 and 443 are open: `sudo ufw status`

### Domain not routing to site

1. Verify the site is running in the dashboard
2. Check Caddyfile has correct port
3. Reload Caddy: `sudo systemctl reload caddy`

---

## Related Documentation

- [Getting Started](getting-started.md) — Initial setup including DNS
- [Configuration](configuration.md) — Server configuration
