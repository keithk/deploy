# Extras

Additional features and integrations.

---

## Bluesky Integration

Connect your site to the [Bluesky](https://bsky.app/) network for domain verification.

### Setup

1. Get your DID from Bluesky (Settings → Advanced → DID)
2. In the dashboard, go to your site's **Settings**
3. Add your Bluesky DID (coming soon - currently requires manual setup)

### Manual Setup

Add a `.well-known/atproto-did` file to your site that returns your DID:

```
did:plc:your-did-here
```

Or configure via the site's action system to serve this route.

Visiting `https://yoursite.yourdomain.com/.well-known/atproto-did` will return your DID for domain verification.

---

## GitHub Integration

Keep your sites automatically updated when you push to GitHub.

### Per-Site Autodeploy

1. Go to a site in the dashboard
2. Click **Settings**
3. Toggle **Autodeploy** on

This creates a webhook on your GitHub repository. When you push to the default branch, Deploy automatically pulls and redeploys.

### Requirements

For autodeploy to work:
- The site must have a GitHub URL as its git source
- You need a GitHub token configured in Deploy settings (Settings → GitHub)

### Setting Up GitHub Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Create a token with `repo` and `admin:repo_hook` permissions
3. In Deploy dashboard, go to **Settings**
4. Add your GitHub token

---

## Development Sites

Sites with names starting with an underscore (`_`) are treated as development-only:

- `_staging` — Won't be deployed in production mode
- `_test` — Useful for local testing

These sites are still accessible but excluded from production deployments.

---

## Related Documentation

- [Actions](actions/index.md) — Scheduled tasks and webhooks
- [Custom Domains](custom-domains.md) — Using your own domains
