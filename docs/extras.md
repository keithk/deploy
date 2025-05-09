# Extras

Bonus features and integrations to take your sites further.

---

## 🦋 Bluesky Integration

Connect your site to the [Bluesky](https://bsky.app/) social network with a single config option.

Add your Bluesky atproto DID to any site's `config.json`:

```json
{
  "bskyDid": "did:plc:t3ehyucfy7ofylu4spnivvmb"
}
```

- Works with any site type
- Each site can have its own unique Bluesky identity

Visiting `https://yourdomain.com/.well-known/atproto-did` will return your DID for domain verification. You can set up a DID for _each site_, or just on your default site.

---

## 🔔 GitHub Integration

Keep your sites up-to-date with GitHub pushes. When configured, DialUpDeploy will:

1. Receive webhook events from GitHub
2. Pull the latest changes
3. Rebuild and restart only affected sites

### Setup

Add this to your root `config.json`:

```json
{
  "github": {
    "repository": "username/repo-name",
    "branch": "main",
    "secret": "your-webhook-secret"
  }
}
```

- `repository`: Format `username/repo-name`
- `branch`: Branch to pull from (default: `main`)
- `secret`: Secret token for securing your webhook

#### GitHub Webhook Settings

1. Go to your repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://yourdomain.com/webhook/github`
3. Content type: `application/json`
4. Secret: (must match your config)
5. Events: Usually just "Push events"
6. Click "Add webhook"

---

## 🔗 Related

- [Configuration](configuration.md)
- [Actions](actions.md)
- [Site Types](site-types.md)
