// Pokemon API - Dynamic Site Example
// This is a simple API that returns Pokemon data

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

  // Handle /api/pokemon endpoint
  if (path === "/api/pokemon") {
    return Response.json(getPokemonList());
  }

  // Handle /api/pokemon/:id endpoint
  const pokemonIdMatch = path.match(/^\/api\/pokemon\/(\d+)$/);
  if (pokemonIdMatch) {
    const id = parseInt(pokemonIdMatch[1]);
    const pokemon = getPokemonById(id);

    if (pokemon) {
      return Response.json(pokemon);
    } else {
      return Response.json({ error: "Pokemon not found" }, { status: 404 });
    }
  }

  // Handle /api/types endpoint
  if (path === "/api/types") {
    return Response.json(getPokemonTypes());
  }

  // Handle /api/type/:type endpoint
  const typeMatch = path.match(/^\/api\/type\/([a-z-]+)$/);
  if (typeMatch) {
    const type = typeMatch[1];
    const pokemonByType = getPokemonByType(type);

    if (pokemonByType.pokemon.length > 0) {
      return Response.json(pokemonByType);
    } else {
      return Response.json(
        { error: "Type not found or no Pokemon of this type" },
        { status: 404 }
      );
    }
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
  <title>Pokemon API Documentation</title>
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
      color: #e53935;
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
    }
    h2 {
      color: #3949ab;
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
      border-left: 4px solid #3949ab;
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
      background-color: #3949ab;
      color: white;
      text-decoration: none;
      border-radius: 4px;
    }
    .try-it:hover {
      background-color: #303f9f;
    }
  </style>
</head>
<body>
  <h1>Pokemon API Documentation</h1>
  <p>Welcome to the Pokemon API! This simple API provides information about Pokemon from the first generation.</p>

  <h2>Endpoints</h2>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/pokemon</span></p>
    <p>Returns a list of all available Pokemon.</p>
    <p><a href="/api/pokemon" class="try-it">Try it</a></p>
    <pre><code>{
  "pokemon": [
    { "id": 1, "name": "Bulbasaur", "types": ["grass", "poison"] },
    { "id": 2, "name": "Ivysaur", "types": ["grass", "poison"] },
    ...
  ]
}</code></pre>
  </div>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/pokemon/:id</span></p>
    <p>Returns details for a specific Pokemon by ID.</p>
    <p><a href="/api/pokemon/25" class="try-it">Try it (Pikachu)</a></p>
    <pre><code>{
  "id": 25,
  "name": "Pikachu",
  "types": ["electric"],
  "height": "0.4m",
  "weight": "6.0kg",
  "abilities": ["Static", "Lightning Rod"],
  "stats": {
    "hp": 35,
    "attack": 55,
    "defense": 40,
    "speed": 90
  }
}</code></pre>
  </div>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/types</span></p>
    <p>Returns a list of all Pokemon types.</p>
    <p><a href="/api/types" class="try-it">Try it</a></p>
    <pre><code>{
  "types": ["normal", "fire", "water", "grass", "electric", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"]
}</code></pre>
  </div>

  <div class="endpoint">
    <p><span class="method">GET</span> <span class="url">/api/type/:type</span></p>
    <p>Returns all Pokemon of a specific type.</p>
    <p><a href="/api/type/electric" class="try-it">Try it (Electric)</a></p>
    <pre><code>{
  "type": "electric",
  "pokemon": [
    { "id": 25, "name": "Pikachu" },
    { "id": 26, "name": "Raichu" },
    ...
  ]
}</code></pre>
  </div>

  <footer style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #777;">
    <p>This is a demo API for DialUpDeploy's dynamic site example.</p>
  </footer>
</body>
</html>`;
}

// Pokemon data
function getPokemonList() {
  return {
    pokemon: [
      { id: 1, name: "Bulbasaur", types: ["grass", "poison"] },
      { id: 2, name: "Ivysaur", types: ["grass", "poison"] },
      { id: 3, name: "Venusaur", types: ["grass", "poison"] },
      { id: 4, name: "Charmander", types: ["fire"] },
      { id: 5, name: "Charmeleon", types: ["fire"] },
      { id: 6, name: "Charizard", types: ["fire", "flying"] },
      { id: 7, name: "Squirtle", types: ["water"] },
      { id: 8, name: "Wartortle", types: ["water"] },
      { id: 9, name: "Blastoise", types: ["water"] },
      { id: 25, name: "Pikachu", types: ["electric"] },
      { id: 26, name: "Raichu", types: ["electric"] },
      { id: 94, name: "Gengar", types: ["ghost", "poison"] },
      { id: 95, name: "Onix", types: ["rock", "ground"] },
      { id: 131, name: "Lapras", types: ["water", "ice"] },
      { id: 143, name: "Snorlax", types: ["normal"] },
      { id: 149, name: "Dragonite", types: ["dragon", "flying"] },
      { id: 150, name: "Mewtwo", types: ["psychic"] },
      { id: 151, name: "Mew", types: ["psychic"] }
    ]
  };
}

// Get detailed Pokemon data by ID
function getPokemonById(id: number) {
  interface PokemonDetail {
    id: number;
    name: string;
    types: string[];
    height: string;
    weight: string;
    abilities: string[];
    stats: {
      hp: number;
      attack: number;
      defense: number;
      speed: number;
    };
  }

  const pokemonDetails: Record<number, PokemonDetail> = {
    1: {
      id: 1,
      name: "Bulbasaur",
      types: ["grass", "poison"],
      height: "0.7m",
      weight: "6.9kg",
      abilities: ["Overgrow", "Chlorophyll"],
      stats: {
        hp: 45,
        attack: 49,
        defense: 49,
        speed: 45
      }
    },
    4: {
      id: 4,
      name: "Charmander",
      types: ["fire"],
      height: "0.6m",
      weight: "8.5kg",
      abilities: ["Blaze", "Solar Power"],
      stats: {
        hp: 39,
        attack: 52,
        defense: 43,
        speed: 65
      }
    },
    7: {
      id: 7,
      name: "Squirtle",
      types: ["water"],
      height: "0.5m",
      weight: "9.0kg",
      abilities: ["Torrent", "Rain Dish"],
      stats: {
        hp: 44,
        attack: 48,
        defense: 65,
        speed: 43
      }
    },
    25: {
      id: 25,
      name: "Pikachu",
      types: ["electric"],
      height: "0.4m",
      weight: "6.0kg",
      abilities: ["Static", "Lightning Rod"],
      stats: {
        hp: 35,
        attack: 55,
        defense: 40,
        speed: 90
      }
    },
    94: {
      id: 94,
      name: "Gengar",
      types: ["ghost", "poison"],
      height: "1.5m",
      weight: "40.5kg",
      abilities: ["Cursed Body", "Levitate"],
      stats: {
        hp: 60,
        attack: 65,
        defense: 60,
        speed: 110
      }
    },
    150: {
      id: 150,
      name: "Mewtwo",
      types: ["psychic"],
      height: "2.0m",
      weight: "122.0kg",
      abilities: ["Pressure", "Unnerve"],
      stats: {
        hp: 106,
        attack: 110,
        defense: 90,
        speed: 130
      }
    }
  };

  return pokemonDetails[id] || null;
}

// Get all Pokemon types
function getPokemonTypes() {
  return {
    types: [
      "normal",
      "fire",
      "water",
      "grass",
      "electric",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
      "dark",
      "steel",
      "fairy"
    ]
  };
}

// Get Pokemon by type
function getPokemonByType(type: string) {
  const allPokemon = getPokemonList().pokemon;
  const filteredPokemon = allPokemon.filter((p) => p.types.includes(type));

  return {
    type,
    pokemon: filteredPokemon.map((p) => ({ id: p.id, name: p.name }))
  };
}
