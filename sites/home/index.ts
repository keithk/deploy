import { Hono } from 'hono'
import { serve } from 'bun'

const app = new Hono()

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Keith's Home</title>
      <style>
        body {
          font-family: 'MonaspaceNeon', 'Fira Code', monospace;
          background: green;
          color: #f8f9fa;
          margin: 0;
          padding: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          text-align: center;
          max-width: 600px;
          padding: 2rem;
        }
        h1 {
          font-size: 3rem;
          margin-bottom: 1rem;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        p {
          font-size: 1.2rem;
          margin-bottom: 2rem;
          opacity: 0.9;
        }
        .links {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .link {
          background: rgba(255,255,255,0.2);
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          text-decoration: none;
          color: #f8f9fa;
          border: 1px solid rgba(255,255,255,0.3);
          transition: all 0.3s ease;
        }
        .link:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-2px);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>👋 Hey, I'm Keith</h1>
        <p>Just testing that you can see this...</p>
        <div class="links">
          <a href="https://editor.dev.deploy" class="link">🛠️ Editor</a>
          <a href="https://admin.dev.deploy" class="link">⚙️ Admin</a>
          <a href="https://github.com/keith" class="link">📦 GitHub</a>
        </div>
        <p><small>Built with Hono + TypeScript, deployed with 💜</small></p>
      </div>
    </body>
    </html>
  `)
})

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const port = parseInt(process.env.PORT || '3000')

console.log(`🚀 Keith's home site running on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}