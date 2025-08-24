/**
 * Letterboxd to Markdown Converter Example
 * 
 * This action demonstrates how to automatically sync content from RSS feeds
 * to your static site. It fetches movie reviews from a Letterboxd RSS feed and 
 * converts them to markdown files for use in content collections, including
 * automatic image downloading.
 *
 * Features:
 * - Fetches content from RSS feeds
 * - Parses XML/RSS data into structured content
 * - Downloads and stores associated images
 * - Converts to markdown with proper frontmatter
 * - Skips existing content to avoid duplicates
 * - Perfect for movie blogs, review sites, or any RSS-based content
 *
 * Setup:
 * 1. Replace RSS_URL with your Letterboxd RSS feed URL (or any movie RSS feed)
 * 2. Adjust the content directory paths for your site structure
 * 3. Place this file in your site's .deploy/actions/ directory
 * 4. Run: deploy actions run sync-letterboxd
 * 5. Consider setting up as a scheduled action for automatic updates
 */

import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import { Parser } from 'xml2js';

// Configuration constants
const RSS_URL = 'https://letterboxd.com/YOUR_USERNAME/rss/'; // Replace with your RSS feed

// TypeScript interfaces for data models
interface LetterboxdItem {
  'letterboxd:filmTitle'?: string;
  'letterboxd:filmYear'?: string;
  'letterboxd:memberRating'?: string;
  'letterboxd:watchedDate'?: string;
  description?: string;
  link?: string;
}

interface LetterboxdRSS {
  rss: {
    channel: {
      item: LetterboxdItem | LetterboxdItem[];
    };
  };
}

/**
 * Fetches the RSS feed from the given URL
 */
async function fetchRSS(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch RSS feed: ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Parses the RSS XML into a structured format
 */
async function parseRSS(xml: string): Promise<LetterboxdRSS> {
  const parser = new Parser({
    explicitArray: false,
    mergeAttrs: true,
    tagNameProcessors: [(name: string) => name.toLowerCase()]
  });
  
  return parser.parseStringPromise(xml);
}

/**
 * Extracts the image URL from the RSS item description
 */
function extractImageUrl(description: string): string | null {
  const imageRegex = /<img[^>]+src="([^">]+)"/i;
  const match = description.match(imageRegex);
  return match ? match[1] : null;
}

/**
 * Extracts the review text from the RSS description, removing HTML
 */
function extractReviewText(description: string): string {
  // Remove image tags
  let cleanText = description.replace(/<img[^>]*>/gi, '');
  
  // Remove other HTML tags but keep the text content
  cleanText = cleanText.replace(/<[^>]*>/gi, '');
  
  // Clean up whitespace and decode HTML entities
  cleanText = cleanText
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
  
  return cleanText;
}

/**
 * Downloads an image from a URL and saves it locally
 */
async function downloadImage(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  
  const buffer = await response.arrayBuffer();
  await fs.ensureDir(path.dirname(destination));
  await fs.writeFile(destination, Buffer.from(buffer));
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
 * Sanitizes a string for use as a filename
 */
function sanitizeFilename(title: string, year?: string): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const yearSuffix = year ? `-${year}` : '';
  return `${cleanTitle}${yearSuffix}.md`;
}

/**
 * Formats date for content collections
 */
function formatDateForContent(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    // Fallback to current date if parsing fails
    return new Date().toISOString();
  }
  return date.toISOString();
}

/**
 * Main function to fetch and process reviews
 */
async function main(sitePath: string): Promise<void> {
  // Configure directory paths (adjust for your site structure)
  const MOVIES_DIR = sitePath ? path.join(sitePath, 'src/content/movies') : path.join(__dirname, '../../src/content/movies');
  const IMAGES_DIR = sitePath ? path.join(sitePath, 'src/assets/images/movies') : path.join(__dirname, '../../src/assets/images/movies');

  // Ensure directories exist
  await fs.ensureDir(MOVIES_DIR);
  await fs.ensureDir(IMAGES_DIR);

  console.log('Fetching RSS feed from Letterboxd...');
  const xml = await fetchRSS(RSS_URL);
  
  console.log('Parsing RSS feed...');
  const rss = await parseRSS(xml);
  
  // Handle both single item and array of items
  const items = Array.isArray(rss.rss.channel.item) 
    ? rss.rss.channel.item 
    : [rss.rss.channel.item];

  console.log(`Found ${items.length} reviews in the RSS feed.`);

  let processed = 0;

  for (const item of items) {
    const title = item['letterboxd:filmTitle'] || 'Unknown Title';
    const year = item['letterboxd:filmYear'];
    const rating = item['letterboxd:memberRating'];
    const watchedDate = item['letterboxd:watchedDate'] || new Date().toISOString();
    const description = item.description || '';
    
    // Extract image URL and review text
    const imageUrl = extractImageUrl(description);
    const review = extractReviewText(description);
    
    // Generate filename and paths
    const slug = sanitizeFilename(title, year);
    const mdPath = path.join(MOVIES_DIR, slug);
    
    // Extract image filename from URL
    const imageFilename = imageUrl ? path.basename(new URL(imageUrl).pathname) : '';
    const imageDest = imageUrl ? path.join(IMAGES_DIR, imageFilename) : '';

    // Skip if file already exists (no overwriting)
    if (await fileExists(mdPath)) {
      console.log(`Skipping existing review: ${title} (${year || 'Unknown Year'})`);
      continue;
    }

    // Download image if needed
    if (imageUrl && !(await fileExists(imageDest))) {
      try {
        await downloadImage(imageUrl, imageDest);
        console.log(`Downloaded image for: ${title} (${year || 'Unknown Year'})`);
      } catch (e) {
        console.error(`Failed to download image for ${title}:`, e instanceof Error ? e.message : e);
      }
    }

    // Create markdown content with frontmatter (adjust schema as needed)
    const formattedDate = formatDateForContent(watchedDate);
    const posterPath = imageFilename ? `/src/assets/images/movies/${imageFilename}` : '';
    
    const mdContent = `---
title: "${title}"
year: ${year || 'null'}
rating: ${rating || 'null'}
dateWatched: ${formattedDate}
poster: "${posterPath}"
letterboxdUrl: "${item.link || ''}"
tags:
  - movie
  - review
  - letterboxd
---

${review}

<div class='import-note'>🎬 This review was imported from <a href='${item.link}'>Letterboxd</a>.</div>`;

    // Write markdown file
    await fs.writeFile(mdPath, mdContent, 'utf8');
    console.log(`Created: ${mdPath}`);
    processed++;
  }

  console.log(`Done! Processed ${processed} new movie reviews.`);
}

// Export as a deploy action
export default {
  id: "sync-letterboxd",
  type: "custom",
  async handler(payload: any, context: any) {
    try {
      const sitePath = context.site?.path || '';
      await main(sitePath);

      return {
        success: true,
        message: "Successfully synchronized movie reviews from Letterboxd"
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in Letterboxd sync: ${error instanceof Error ? error.message : error}`
      };
    }
  }
};