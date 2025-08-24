/**
 * Raindrop.io to Markdown Converter Example
 *
 * This action demonstrates how to automatically sync content from external APIs
 * to your static site. It fetches bookmarks from Raindrop.io API that are tagged 
 * with 'public' and converts them to markdown files for use in Astro content collections.
 *
 * Features:
 * - Fetches data from external API (Raindrop.io)
 * - Converts API data to markdown frontmatter format
 * - Skips existing content to avoid duplicates
 * - Uses site-specific environment variables
 * - Perfect for automating content updates via scheduled runs
 *
 * Setup:
 * 1. Get your Raindrop.io API token from https://app.raindrop.io/settings/integrations
 * 2. Add RAINDROP_TOKEN to your site's .env file
 * 3. Tag bookmarks with 'public' in Raindrop to sync them
 * 4. Place this file in your site's .deploy/actions/ directory
 * 5. Run: deploy actions run sync-raindrop
 */

import fs from 'fs-extra';
import path from 'path';

// Configuration constants
const API_URL = 'https://api.raindrop.io/rest/v1';
const MAX_ITEMS = 50; // Maximum number of items to fetch per page

// TypeScript interfaces for data models
interface RaindropBookmark {
  _id: number;
  title: string;
  excerpt: string;
  link: string;
  created: string;
  tags: string[];
  cover?: string;
  domain?: string;
  type?: string;
  note?: string;
  collection?: {
    _id: number;
    title: string;
  };
}

interface RaindropResponse {
  items: RaindropBookmark[];
  count: number;
  result: boolean;
}

/**
 * Fetches public bookmarks from Raindrop.io API
 */
async function fetchPublicBookmarks(token: string): Promise<RaindropBookmark[]> {
  if (!token) {
    throw new Error(
      'Raindrop API token not found. Set RAINDROP_TOKEN in your environment variables.'
    );
  }

  let allBookmarks: RaindropBookmark[] = [];
  let page = 0;
  let totalCount = 0;
  let hasMore = true;

  console.log('Fetching bookmarks from Raindrop.io...');

  while (hasMore) {
    // Search for bookmarks with 'public' tag
    const res = await fetch(
      `${API_URL}/raindrops/0?search=[{"key":"tag","val":"public"}]&perpage=${MAX_ITEMS}&page=${page}&full=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch bookmarks: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as RaindropResponse;

    if (!data.result) {
      throw new Error('Failed to fetch bookmarks from Raindrop.io API');
    }

    if (page === 0) {
      totalCount = data.count;
      console.log(`Found ${totalCount} public bookmarks in total.`);
    }

    const fetchedItems = data.items.length;
    console.log(`Fetched ${fetchedItems} bookmarks (page ${page + 1}).`);

    allBookmarks = [...allBookmarks, ...data.items];

    // Check if we need to fetch more pages
    hasMore = allBookmarks.length < totalCount && fetchedItems > 0;
    page++;
  }

  return allBookmarks;
}

/**
 * Slugifies a string for use in filenames
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Formats the date to ISO string for content collections
 */
function formatDateForContent(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString();
}

/**
 * Formats tags for frontmatter
 */
function formatTags(tags: string[], collection?: {title: string}): string[] {
  // Filter out the 'public' tag as it's used for filtering only
  const filteredTags = tags.filter(tag => tag !== 'public');

  // Add collection as a tag if available
  if (collection && collection.title) {
    filteredTags.push(collection.title);
  }

  // Add default tags
  filteredTags.push('link', 'bookmark');

  // Remove duplicates and sort
  return [...new Set(filteredTags)].sort();
}

/**
 * Checks if a file exists
 */
async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main function to process the bookmarks and create markdown files
 */
async function main(token: string, sitePath: string): Promise<void> {
  try {
    console.log('Fetching public bookmarks from Raindrop.io...');
    const bookmarks = await fetchPublicBookmarks(token);

    // Configure content directory (adjust path as needed for your site structure)
    const LINKS_DIR = sitePath ? path.join(sitePath, 'src/content/links') : path.join(__dirname, '../../src/content/links');

    // Ensure links directory exists
    await fs.ensureDir(LINKS_DIR);

    console.log(`Processing ${bookmarks.length} bookmarks...`);
    let processed = 0;
    let skipped = 0;

    for (const bookmark of bookmarks) {
      const {title, excerpt, link, created, tags, cover} = bookmark;
      const formattedDate = formatDateForContent(created);
      
      // Generate unique filename
      const fileName = `${slugify(title)}-${bookmark._id}.md`;
      const filePath = path.join(LINKS_DIR, fileName);

      // Skip if file already exists
      if (await fileExists(filePath)) {
        console.log(`Skipping existing bookmark: ${title}`);
        skipped++;
        continue;
      }

      // Format tags for content collection
      const formattedTags = formatTags(tags, bookmark.collection);

      // Clean up the excerpt and note for display
      const cleanExcerpt = excerpt ? excerpt.trim() : '';
      const cleanNote = bookmark.note ? bookmark.note.trim() : '';

      // Handle domain parsing safely
      let domain = bookmark.domain;
      if (!domain) {
        try {
          domain = new URL(link).hostname;
        } catch (e) {
          domain = 'unknown-domain';
        }
      }

      // Create content collection frontmatter (adjust schema as needed)
      const frontMatter = `---
title: "${title}"
description: "${cleanExcerpt}"
url: "${link}"
date: ${formattedDate}
domain: "${domain}"
tags: [${formattedTags.map(tag => `"${tag}"`).join(', ')}]
raindropId: ${bookmark._id}
${cover ? `cover: "${cover}"` : ''}
---

${cleanNote}${cover ? `\n\n![Cover image](${cover})` : ''}`;

      // Write markdown file
      await fs.writeFile(filePath, frontMatter, 'utf8');
      console.log(`Created: ${filePath}`);

      processed++;
    }

    console.log(
      `Done! Processed ${processed} new bookmarks. Skipped ${skipped} existing bookmarks.`
    );
  } catch (error) {
    console.error(
      'Error in Raindrop sync:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

// Export as a deploy action
export default {
  id: "sync-raindrop",
  type: "custom",
  async handler(payload: any, context: any) {
    try {
      // Get token from context.env first (site-specific .env), then fallback to process.env
      const token = context.env?.RAINDROP_TOKEN || process.env.RAINDROP_TOKEN;
      if (!token) {
        return {
          success: false,
          message: "Raindrop API token not found. Set RAINDROP_TOKEN in your environment variables."
        };
      }

      const sitePath = context.site?.path || '';
      await main(token, sitePath);

      return {
        success: true,
        message: "Successfully synchronized bookmarks from Raindrop.io"
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in Raindrop sync: ${error instanceof Error ? error.message : error}`
      };
    }
  }
};