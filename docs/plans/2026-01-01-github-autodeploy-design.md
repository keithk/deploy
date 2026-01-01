# GitHub Autodeploy Design

## Overview

Add automatic deployment when code is pushed to GitHub. Each site can enable autodeploy, which creates a webhook on its GitHub repository. When pushes occur, the site is automatically pulled and rebuilt.

## Goals

- Per-site autodeploy toggle in admin UI
- Automatic webhook creation/deletion via GitHub API
- Secure webhook verification using shared secret
- Match incoming webhooks to sites by repository URL

## Database Changes

### New field on `sites` table

```sql
ALTER TABLE sites ADD COLUMN autodeploy INTEGER DEFAULT 0;
```

### New setting

`github_webhook_secret` - Auto-generated 32-char hex string for verifying webhook signatures.

### Model updates

- `CreateSiteData` and `UpdateSiteData`: Add optional `autodeploy?: boolean`
- `Site` interface: Add `autodeploy: number` (SQLite boolean)
- `SiteModel.update()`: Handle autodeploy field like persistent_storage
- `SiteModel.findByGitUrl(gitUrl)`: New method to look up sites by normalized git URL

## GitHub Webhook Management API

### POST /api/github/webhooks

Create a webhook on a GitHub repo.

**Request:**
```json
{ "git_url": "https://github.com/user/repo" }
```

**Behavior:**
1. Extract owner/repo from URL
2. Get PAT from settings
3. Get or generate `github_webhook_secret`
4. Call GitHub API: `POST /repos/{owner}/{repo}/hooks`

**Webhook config sent to GitHub:**
```json
{
  "config": {
    "url": "https://admin.{domain}/webhook/github",
    "content_type": "json",
    "secret": "<github_webhook_secret>"
  },
  "events": ["push"],
  "active": true
}
```

### DELETE /api/github/webhooks

Remove a webhook from a GitHub repo.

**Request:**
```json
{ "git_url": "https://github.com/user/repo" }
```

**Behavior:**
1. Extract owner/repo from URL
2. List webhooks: `GET /repos/{owner}/{repo}/hooks`
3. Find webhook matching our URL
4. Delete it: `DELETE /repos/{owner}/{repo}/hooks/{id}`

## Webhook Receiver

### Updated /webhook/github endpoint

1. **Verify signature** using `github_webhook_secret` from settings
2. **Extract repo URL** from payload (`repository.clone_url` or `repository.html_url`)
3. **Normalize URL** to canonical form (`github.com/owner/repo`)
4. **Find matching site** via `siteModel.findByGitUrl()`
5. **Check autodeploy** - return 403 if disabled
6. **Pull and rebuild** the site
7. **Log activity** to site's build logs

### URL Normalization

Sites may store URLs in various formats:
- `https://github.com/user/repo`
- `https://github.com/user/repo.git`
- `git@github.com:user/repo.git`

Normalize to: `github.com/user/repo` (lowercase, no protocol, no .git suffix)

### Response Codes

- `200` - Success with rebuild status
- `401` - Invalid signature
- `403` - Site found but autodeploy disabled
- `404` - No matching site

## Admin UI

### Site Settings Tab

Add "Autodeploy" section in `site-detail.ts`:

```html
<div class="settings-section">
  <h3 class="settings-section-title">Autodeploy</h3>
  <label class="form-checkbox">
    <input type="checkbox" id="autodeploy-checkbox">
    <span>Deploy automatically when code is pushed to GitHub</span>
  </label>
  <p class="text-muted mt-4">Creates a webhook on the GitHub repository.</p>
</div>
```

### Toggle Behavior

When checkbox changes:
1. Call `PATCH /api/sites/:id` with `{ autodeploy: boolean }`
2. Backend updates database
3. Backend calls GitHub API to create/delete webhook
4. Show success or error feedback

### Error Handling

- GitHub token not configured → Link to settings page
- Webhook creation fails → Show error, revert toggle
- Repo not found or no permission → Show specific error message

## Implementation Phases

- [ ] **Phase 1: Database** - Add migration, update Site model and interfaces
- [ ] **Phase 2: Webhook API** - Add POST/DELETE /api/github/webhooks endpoints
- [ ] **Phase 3: Receiver** - Update webhook handler to match by repo URL
- [ ] **Phase 4: Admin UI** - Add autodeploy toggle to site settings
- [ ] **Phase 5: Integration** - Wire toggle to create/delete webhooks on change

## Testing

- Unit tests for URL normalization
- Unit tests for webhook signature verification
- Integration test for webhook creation/deletion
- E2E test for full autodeploy flow
