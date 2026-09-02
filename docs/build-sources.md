# Build Sources

Some sites need files at build time that cannot live in their own repository — a private plugin package, purchased artwork, a licensed font set. Build sources copy those directories into the build context on every deploy, so the site's repository stays public and the private material stays on the server or in a private repo.

---

## How It Works

Between the clone and the build, Deploy applies each build source to the site checkout:

```
1. Clone   →  /var/deploy/sites/mysite/
2. Overlay →  /var/deploy/sites/mysite/vendor/plugin/   (from a private git repo)
              /var/deploy/sites/mysite/vendor/assets/   (from a server directory)
3. Build   →  railpack builds the whole directory
```

Inside the build, that checkout is `/app` — so `vendor/plugin` above is `/app/vendor/plugin`.

Each source is replaced from scratch on every deploy, so a build never picks up files an earlier deploy left behind.

### Source types

**`git`** — cloned shallow on every deploy. Private repositories work as long as a GitHub token is set in server settings, the same token used for private site repos. The `.git` directory is stripped after cloning, so only the files reach the build.

**`path`** — a file or directory already on the server, copied as-is. This is the option for anything that must never be committed anywhere: licensed artwork, vendor bundles, generated assets.

### Destinations

`dest` is always relative to the site checkout. Deploy rejects a destination that is absolute, climbs out of the checkout with `..`, or writes into `.git`.

---

## Adding a Build Source

### Via Dashboard

1. Click on your site
2. Go to **Settings** → **Build Sources**
3. Choose **Git repo** or **Server path**, fill in the source and destination, and click **Add**
4. Redeploy

### Via API

```bash
curl -X PUT https://admin.yourdomain.com/api/sites/$SITE_ID/build-sources \
  -H "Content-Type: application/json" \
  -b "session=$TOKEN" \
  -d '{
    "build_sources": [
      { "type": "git", "source": "https://github.com/you/private-plugin.git", "dest": "vendor/plugin" },
      { "type": "path", "source": "/srv/site-assets", "dest": "vendor/assets" }
    ]
  }'
```

`PUT` replaces the whole list; send `[]` to clear it.

---

## Build Variables

A site's environment variables are also passed to the build, as BuildKit secrets. They are readable by build commands but are not baked into the image layers.

This is how a build is pointed at whatever the overlay just added:

```
ATMOBB_CONFIG=/app/vendor/plugin/config.mjs
```

Deploy groups build one shared image. Only environment variables with the same key and value on every group member are available to that build; differing variables are treated as per-site runtime configuration and are injected when each container starts.

---

## Notes

- Build sources apply to `auto` (Railpack) sites. Compose sites build from their own project definition.
- A `path` source must exist on the server before the deploy runs — a missing directory fails the build with a clear message rather than shipping an incomplete image.
- Overlaid files land in the runtime image too. Keep sources to what the build actually needs.
- Two sources cannot write to the same destination.
