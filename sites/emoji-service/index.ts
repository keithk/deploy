// Emoji Service - Dynamic Site Example
// This is a simple API that returns random emojis

export function handleRequest(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle root path - API documentation
  if (path === "/" || path === "") {
    return new Response(generateDocHTML(), {
      status: 200,
      headers: {
        "Content-Type": "text/html"
      }
    });
  }

  // Handle /api/random endpoint
  if (path === "/api/random") {
    return Response.json(getRandomEmoji());
  }

  // Handle /api/category/:category endpoint
  const categoryMatch = path.match(/^\/api\/category\/([a-z-]+)$/);
  if (categoryMatch) {
    const category = categoryMatch[1];
    const emoji = getRandomEmojiByCategory(category);

    if (emoji) {
      return Response.json(emoji);
    } else {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }
  }

  // Handle /api/categories endpoint
  if (path === "/api/categories") {
    return Response.json(getCategories());
  }

  // Handle /api/all endpoint
  if (path === "/api/all") {
    return Response.json(getAllEmojis());
  }

  // Handle 404 for any other path
  return Response.json({ error: "Not found" }, { status: 404 });
}

// Generate HTML documentation for the API
function generateDocHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emoji Service API Documentation</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #ff5722;
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
    }
    h2 {
      color: #2196f3;
      margin-top: 30px;
    }
    code {
      background-color: #f5f5f5;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: 'Courier New', Courier, monospace;
    }
    pre {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
    }
    .endpoint {
      margin-bottom: 30px;
      border-left: 4px solid #2196f3;
      padding-left: 15px;
    }
    .method {
      display: inline-block;
      padding: 3px 8px;
      background-color: #4caf50;
      color: white;
      border-radius: 4px;
      font-weight: bold;
      margin-right: 10px;
    }
    .url {
      font-weight: bold;
      font-family: 'Courier New', Courier, monospace;
    }
    .try-it {
      display: inline-block;
      margin-top: 10px;
      padding: 5px 10px;
      background-color: #2196f3;
      color: white;
      text-decoration: none;
      border-radius: 4px;
    }
    .try-it:hover {
      background-color: #1976d2;
    }
    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 10px;
      margin: 20px 0;
    }
    .emoji-item {
      font-size: 2rem;
      text-align: center;
      padding: 10px;
      background-color: #f5f5f5;
      border-radius: 8px;
      transition: transform 0.2s;
    }
    .emoji-item:hover {
      transform: scale(1.1);
      background-color: #e0e0e0;
    }
  </style>
</head>
<body>
  <h1>Emoji Service API Documentation</h1>
  <p>Welcome to the Emoji Service API! This simple API provides random emojis for your applications.</p>

  <div class="emoji-grid">
    <div class="emoji-item">😀</div>
    <div class="emoji-item">🚀</div>
    <div class="emoji-item">🌈</div>
    <div class="emoji-item">🍕</div>
    <div class="emoji-item">🐱</div>
    <div class="emoji-item">🌺</div>
    <div class="emoji-item">⚽</div>
    <div class="emoji-item">🎮</div>
  </div>

  <h2>Endpoints</h2>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/random</span></p>
    <p>Returns a random emoji from any category.</p>
    <p><a href="/api/random" class="try-it">Try it</a></p>
    <pre><code>{
  "emoji": "🚀",
  "name": "rocket",
  "category": "travel-places",
  "description": "A rocket being propelled into space."
}</code></pre>
  </div>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/category/:category</span></p>
    <p>Returns a random emoji from the specified category.</p>
    <p><a href="/api/category/animals-nature" class="try-it">Try it (Animals & Nature)</a></p>
    <pre><code>{
  "emoji": "🐶",
  "name": "dog",
  "category": "animals-nature",
  "description": "A dog, a faithful pet and man's best friend."
}</code></pre>
  </div>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/categories</span></p>
    <p>Returns a list of all available emoji categories.</p>
    <p><a href="/api/categories" class="try-it">Try it</a></p>
    <pre><code>{
  "categories": [
    "smileys-emotion",
    "people-body",
    "animals-nature",
    "food-drink",
    "travel-places",
    "activities",
    "objects",
    "symbols",
    "flags"
  ]
}</code></pre>
  </div>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/all</span></p>
    <p>Returns all available emojis grouped by category.</p>
    <p><a href="/api/all" class="try-it">Try it</a></p>
    <pre><code>{
  "categories": {
    "smileys-emotion": [
      { "emoji": "😀", "name": "grinning face" },
      { "emoji": "😃", "name": "grinning face with big eyes" },
      ...
    ],
    "animals-nature": [
      { "emoji": "🐶", "name": "dog" },
      { "emoji": "🐱", "name": "cat" },
      ...
    ],
    ...
  }
}</code></pre>
  </div>

  <footer style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #777;">
    <p>This is a demo API for DialUpDeploy's dynamic site example.</p>
  </footer>
</body>
</html>`;
}

// Emoji data by category
interface EmojiData {
  emoji: string;
  name: string;
  category: string;
  description: string;
}

// Get all emoji categories
function getCategories() {
  return {
    categories: [
      "smileys-emotion",
      "people-body",
      "animals-nature",
      "food-drink",
      "travel-places",
      "activities",
      "objects",
      "symbols",
      "flags"
    ]
  };
}

// Define emoji category type
type EmojiCategory = {
  emoji: string;
  name: string;
}[];

// Define categories object type
interface EmojiCategories {
  [key: string]: EmojiCategory;
}

// Get all emojis grouped by category
function getAllEmojis() {
  return {
    categories: {
      "smileys-emotion": [
        { emoji: "😀", name: "grinning face" },
        { emoji: "😃", name: "grinning face with big eyes" },
        { emoji: "😄", name: "grinning face with smiling eyes" },
        { emoji: "😁", name: "beaming face with smiling eyes" },
        { emoji: "😆", name: "grinning squinting face" },
        { emoji: "😅", name: "grinning face with sweat" },
        { emoji: "🤣", name: "rolling on the floor laughing" },
        { emoji: "😂", name: "face with tears of joy" }
      ],
      "people-body": [
        { emoji: "👋", name: "waving hand" },
        { emoji: "🤚", name: "raised back of hand" },
        { emoji: "🖐️", name: "hand with fingers splayed" },
        { emoji: "✋", name: "raised hand" },
        { emoji: "🖖", name: "vulcan salute" },
        { emoji: "👌", name: "OK hand" },
        { emoji: "🤌", name: "pinched fingers" },
        { emoji: "🤏", name: "pinching hand" }
      ],
      "animals-nature": [
        { emoji: "🐶", name: "dog" },
        { emoji: "🐱", name: "cat" },
        { emoji: "🐭", name: "mouse" },
        { emoji: "🐹", name: "hamster" },
        { emoji: "🐰", name: "rabbit" },
        { emoji: "🦊", name: "fox" },
        { emoji: "🐻", name: "bear" },
        { emoji: "🐼", name: "panda" }
      ],
      "food-drink": [
        { emoji: "🍎", name: "red apple" },
        { emoji: "🍐", name: "pear" },
        { emoji: "🍊", name: "tangerine" },
        { emoji: "🍋", name: "lemon" },
        { emoji: "🍌", name: "banana" },
        { emoji: "🍉", name: "watermelon" },
        { emoji: "🍇", name: "grapes" },
        { emoji: "🍓", name: "strawberry" }
      ],
      "travel-places": [
        { emoji: "🚗", name: "car" },
        { emoji: "🚕", name: "taxi" },
        { emoji: "🚙", name: "sport utility vehicle" },
        { emoji: "🚌", name: "bus" },
        { emoji: "🚎", name: "trolleybus" },
        { emoji: "🏎️", name: "racing car" },
        { emoji: "🚓", name: "police car" },
        { emoji: "🚑", name: "ambulance" }
      ],
      activities: [
        { emoji: "⚽", name: "soccer ball" },
        { emoji: "🏀", name: "basketball" },
        { emoji: "🏈", name: "american football" },
        { emoji: "⚾", name: "baseball" },
        { emoji: "🥎", name: "softball" },
        { emoji: "🎾", name: "tennis" },
        { emoji: "🏐", name: "volleyball" },
        { emoji: "🏉", name: "rugby football" }
      ],
      objects: [
        { emoji: "⌚", name: "watch" },
        { emoji: "📱", name: "mobile phone" },
        { emoji: "💻", name: "laptop" },
        { emoji: "⌨️", name: "keyboard" },
        { emoji: "🖥️", name: "desktop computer" },
        { emoji: "🖨️", name: "printer" },
        { emoji: "🖱️", name: "computer mouse" },
        { emoji: "🖲️", name: "trackball" }
      ],
      symbols: [
        { emoji: "❤️", name: "red heart" },
        { emoji: "🧡", name: "orange heart" },
        { emoji: "💛", name: "yellow heart" },
        { emoji: "💚", name: "green heart" },
        { emoji: "💙", name: "blue heart" },
        { emoji: "💜", name: "purple heart" },
        { emoji: "🖤", name: "black heart" },
        { emoji: "🤍", name: "white heart" }
      ],
      flags: [
        { emoji: "🏁", name: "chequered flag" },
        { emoji: "🚩", name: "triangular flag" },
        { emoji: "🎌", name: "crossed flags" },
        { emoji: "🏴", name: "black flag" },
        { emoji: "🏳️", name: "white flag" },
        { emoji: "🏳️‍🌈", name: "rainbow flag" },
        { emoji: "🏳️‍⚧️", name: "transgender flag" },
        { emoji: "🏴‍☠️", name: "pirate flag" }
      ]
    }
  };
}

// Get a random emoji from any category
function getRandomEmoji(): EmojiData {
  const allEmojis = getAllEmojis().categories as EmojiCategories;
  const categories = Object.keys(allEmojis);
  const randomCategory =
    categories[Math.floor(Math.random() * categories.length)];
  const emojisInCategory = allEmojis[randomCategory];
  const randomEmoji =
    emojisInCategory[Math.floor(Math.random() * emojisInCategory.length)];

  return {
    emoji: randomEmoji.emoji,
    name: randomEmoji.name,
    category: randomCategory,
    description: getEmojiDescription(randomEmoji.emoji, randomEmoji.name)
  };
}

// Get a random emoji from a specific category
function getRandomEmojiByCategory(category: string): EmojiData | null {
  const allEmojis = getAllEmojis().categories as EmojiCategories;

  if (!allEmojis[category]) {
    return null;
  }

  const emojisInCategory = allEmojis[category];
  const randomEmoji =
    emojisInCategory[Math.floor(Math.random() * emojisInCategory.length)];

  return {
    emoji: randomEmoji.emoji,
    name: randomEmoji.name,
    category: category,
    description: getEmojiDescription(randomEmoji.emoji, randomEmoji.name)
  };
}

// Generate a description for an emoji
function getEmojiDescription(emoji: string, name: string): string {
  const descriptions: Record<string, string> = {
    "😀": "A yellow face with a big grin and happy, open eyes.",
    "🐶": "A dog, a faithful pet and man's best friend.",
    "🍎": "A classic red apple, often associated with teachers and healthy eating.",
    "🚗": "A car or automobile used for personal transportation.",
    "⚽": "A black and white soccer ball, used in the world's most popular sport.",
    "📱": "A mobile phone or smartphone for communication and apps.",
    "❤️": "A classic red heart, symbolizing love and affection.",
    "🏁": "A checkered flag used to signal the end of a race."
  };

  return (
    descriptions[emoji] ||
    `A ${name} emoji commonly used in digital communication.`
  );
}
