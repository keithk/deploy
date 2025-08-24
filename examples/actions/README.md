# Content Sync Actions Examples

This directory contains example actions that demonstrate how to automatically sync external content to your static sites using the Deploy system. These examples showcase the power of actions for automating content updates from various external sources.

## 📋 Overview

Actions are TypeScript files that can be run manually or scheduled to perform automated tasks. These examples focus on **content synchronization** - automatically pulling data from external APIs and RSS feeds to generate markdown files for your static site generators (like Astro, Next.js, etc.).

## 🔄 Available Examples

### 1. **Raindrop.io Bookmark Sync** (`syncRaindrop.ts`)

Automatically syncs your public bookmarks from Raindrop.io to your site as markdown files.

**What it does:**
- 🔗 Fetches bookmarks tagged with "public" from Raindrop.io API
- 📝 Converts each bookmark to a markdown file with structured frontmatter
- 🏷️ Preserves tags, descriptions, and metadata
- 🖼️ Includes cover images when available
- ⚡ Skips existing files to avoid duplicates

**Perfect for:**
- Link blogs
- Curated bookmark collections  
- Resource lists
- Reading recommendations

### 2. **Letterboxd Movie Review Sync** (`syncLetterboxd.ts`)

Automatically syncs your movie reviews from Letterboxd RSS feed to your site.

**What it does:**
- 🎬 Fetches movie reviews from your Letterboxd RSS feed
- 📝 Converts each review to a markdown file
- 🖼️ Downloads and stores movie poster images
- ⭐ Preserves ratings, watch dates, and metadata
- 📅 Handles date formatting for content collections
- ⚡ Skips existing reviews to avoid duplicates

**Perfect for:**
- Movie blogs
- Film review sites
- Personal movie journals
- Entertainment content sites

## 🚀 How to Use These Examples

### Step 1: Copy the Action

Copy the example action file to your site's `.deploy/actions/` directory:

```bash
# For Raindrop sync
cp examples/actions/syncRaindrop.ts sites/your-site/.deploy/actions/

# For Letterboxd sync  
cp examples/actions/syncLetterboxd.ts sites/your-site/.deploy/actions/
```

### Step 2: Configure the Action

**For Raindrop sync:**
1. Get your API token from [Raindrop.io Settings → Integrations](https://app.raindrop.io/settings/integrations)
2. Add `RAINDROP_TOKEN=your_token_here` to your site's `.env` file
3. Tag bookmarks with "public" in Raindrop.io to sync them

**For Letterboxd sync:**
1. Replace `YOUR_USERNAME` in `RSS_URL` with your Letterboxd username
2. Adjust directory paths if your site structure differs
3. No API token needed - uses public RSS feed

### Step 3: Customize for Your Site

Both examples include configuration comments showing where to customize:

- **Content directory paths** - Adjust for your site structure
- **Frontmatter schema** - Match your content collection schema
- **Tag formatting** - Customize tags for your site's taxonomy
- **File naming** - Modify filename generation logic

### Step 4: Run the Action

```bash
# Run manually
deploy actions run sync-raindrop
deploy actions run sync-letterboxd

# Or set up as scheduled actions (see scheduling section below)
```

## 📁 Content Structure Examples

### Raindrop Bookmark Output
```markdown
---
title: "Amazing Web Development Resource"
description: "A comprehensive guide to modern web development"
url: "https://example.com/guide"
date: 2024-01-15T10:30:00.000Z
domain: "example.com"
tags: ["webdev", "guide", "resources", "link", "bookmark"]
raindropId: 123456789
cover: "https://example.com/cover.jpg"
---

This is an excellent resource that covers...

![Cover image](https://example.com/cover.jpg)
```

### Letterboxd Movie Review Output
```markdown
---
title: "The Matrix"
year: 1999
rating: 5
dateWatched: 2024-01-15T20:00:00.000Z
poster: "/src/assets/images/movies/matrix-poster.jpg"
letterboxdUrl: "https://letterboxd.com/user/film/the-matrix-1999/"
tags:
  - movie
  - review
  - letterboxd
---

Mind-blowing sci-fi masterpiece that redefined action cinema...

<div class='import-note'>🎬 This review was imported from <a href='https://letterboxd.com/user/film/the-matrix-1999/'>Letterboxd</a>.</div>
```

## ⏰ Setting Up Scheduled Sync

To automatically run these actions on a schedule, you can set up scheduled actions:

### Option 1: Using Cron Syntax
Create a scheduled action configuration in your site's `.deploy/config.json`:

```json
{
  "actions": [
    {
      "id": "daily-bookmark-sync",
      "type": "scheduled", 
      "schedule": "0 6 * * *",
      "command": "deploy actions run sync-raindrop",
      "triggerBuild": true
    },
    {
      "id": "weekly-movie-sync",
      "type": "scheduled",
      "schedule": "0 8 * * 0", 
      "command": "deploy actions run sync-letterboxd",
      "triggerBuild": true
    }
  ]
}
```

### Option 2: GitHub Actions Integration
Set up GitHub Actions to trigger your content sync:

```yaml
# .github/workflows/sync-content.yml
name: Sync Content
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM
  workflow_dispatch:  # Allow manual triggering

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync Bookmarks
        run: deploy actions run sync-raindrop
      - name: Sync Reviews  
        run: deploy actions run sync-letterboxd
```

## 🛠️ Customization Ideas

These examples are designed to be starting points. Here are some ways to extend them:

### Enhanced Raindrop Sync
- Add support for multiple collections
- Include bookmark descriptions in content
- Generate tag-based taxonomy pages
- Add bookmark archiving functionality

### Enhanced Letterboxd Sync
- Parse additional metadata (cast, director)
- Generate movie collection pages
- Add rating-based filtering
- Include viewing statistics

### Additional Content Sources
Use these patterns to sync from:
- **Instagram** - Photo posts via API
- **YouTube** - Video metadata via RSS/API  
- **Spotify** - Recently played tracks
- **GitHub** - Repository stars or commits
- **Twitter/X** - Tweet archives
- **Goodreads** - Book reviews
- **Last.fm** - Music listening history

## 🔧 Action Development Pattern

Both examples follow a consistent pattern for building content sync actions:

```typescript
// 1. Define configuration and interfaces
const API_URL = 'https://api.service.com';
interface DataItem { /* ... */ }

// 2. Create data fetching functions
async function fetchData(token: string): Promise<DataItem[]> {
  // API calls, pagination, error handling
}

// 3. Create data processing functions  
function processItem(item: DataItem): ProcessedItem {
  // Data transformation, sanitization
}

// 4. Create main processing function
async function main(sitePath: string): Promise<void> {
  // Fetch → Process → Write files
}

// 5. Export as action
export default {
  id: "sync-service",
  type: "custom", 
  async handler(payload, context) {
    // Environment setup → Run main → Return result
  }
};
```

## 🐛 Troubleshooting

### Common Issues

**"Cannot find module" errors**
- Ensure you're using plain JavaScript/TypeScript without external package imports
- The examples use Node.js built-ins and common libraries (fs-extra, node-fetch)

**Environment variables not found**
- Ensure `.env` file is in the correct site directory
- Check that variable names match exactly (case-sensitive)
- Use `context.env?.VARIABLE_NAME` instead of `process.env.VARIABLE_NAME`

**Permission errors**
- Ensure the action has write permissions to content directories
- Check that directories exist or are created by the action

**API rate limiting**  
- Add delays between API calls if needed
- Implement exponential backoff for retries
- Cache responses when possible

### Debug Mode
Add debug logging to troubleshoot issues:

```typescript
console.log('Debug: Processing item', item);
console.log('Debug: File path', filePath);
console.log('Debug: Environment vars', Object.keys(context.env || {}));
```

## 💡 Best Practices

1. **Always skip existing files** to avoid overwriting manual edits
2. **Use unique identifiers** in filenames to prevent collisions
3. **Handle API errors gracefully** with proper error messages  
4. **Sanitize user-generated content** to prevent security issues
5. **Use environment variables** for API tokens and sensitive data
6. **Test actions manually** before setting up automation
7. **Include source attribution** in generated content
8. **Implement rate limiting** for APIs with usage restrictions

## 🤝 Contributing

Found ways to improve these examples? Consider:

- Adding error handling for edge cases
- Supporting additional content formats
- Optimizing for better performance  
- Adding more metadata extraction
- Improving documentation

---

These examples demonstrate the power of Deploy actions for automating content workflows. Use them as inspiration to build your own content sync solutions! 🚀