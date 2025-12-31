# UI/UX Design - Admin & Editor Subdomains

## Design Philosophy
- **Mono font everywhere** - Clean, technical aesthetic
- **Minimal but fun** - Simple layouts with subtle personality
- **Terminal-inspired** - Black/dark backgrounds, bright accent colors
- **Responsive** - Works on desktop and mobile
- **Fast** - Server-side rendered, minimal JavaScript

## Color Scheme

```css
/* Terminal-inspired palette */
:root {
  --bg-dark: #1a1a1a;
  --bg-darker: #0d1117;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --accent-green: #2ea043;
  --accent-blue: #0969da;
  --accent-yellow: #d29922;
  --accent-red: #da3633;
  --border: #30363d;
  --hover: #21262d;
}
```

## Typography

```css
/* Mono font stack */
font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
```

---

## admin.yourdomain Design

### Layout Structure
```
┌─────────────────────────────────────────────────┐
│ [ADMIN] Dial Up Deploy                    [⚙️]  │
├─────────────────────────────────────────────────┤
│ Users (12) │ Sites (24) │ Settings │ Logs       │
├─────────────┴─────────────────────────────────────┤
│                                                 │
│  Main Content Area                              │
│  (Dashboard/Users/Sites based on nav)          │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Admin Dashboard
```
SYSTEM STATUS                    RECENT ACTIVITY
├─ ✅ 24 sites running           ├─ user2 created "my-blog"
├─ 📊 2.1GB / 4GB RAM used      ├─ admin updated site limits  
├─ 🔒 3 users active            ├─ user1 deployed "portfolio"
└─ 📈 0.8 CPU load avg          └─ user3 logged in

QUICK ACTIONS
[Create User] [View Logs] [System Settings] [Backup DB]
```

### User Management Page
```
USERS (3/∞)                                    [+ New User]

┌─────────────────────────────────────────────────────────┐
│ admin (you)        ✅ Active    🛡️  Admin             │
│ └─ 8 sites, 1.2GB RAM, admin@localhost              │
├─────────────────────────────────────────────────────────┤
│ user1              ✅ Active    👤 User               │ 
│ └─ 2/3 sites, 256MB/512MB, user1@email.com         │
├─────────────────────────────────────────────────────────┤
│ user2              ⏸️  Inactive  👤 User               │
│ └─ 0/3 sites, 0MB/512MB, user2@email.com           │
└─────────────────────────────────────────────────────────┘

[Edit Limits] [Reset Password] [Disable User] [View Sites]
```

### System Settings
```
REGISTRATION
☑️ Allow new user registration
🔗 Registration link: https://editor.yourdomain/register

DEFAULT LIMITS (for new users)
Sites:   [3        ] max sites
Memory:  [512      ] MB 
CPU:     [0.5      ] cores
Storage: [1024     ] MB

DOMAINS
Admin:   [admin    ].yourdomain
Editor:  [editor   ].yourdomain

SECURITY  
Session timeout: [24] hours
Max login attempts: [5]

[Save Settings]
```

---

## editor.yourdomain Design

### Login/Register Page
```
┌─────────────────────────────────────────────────┐
│                                                 │
│     ╔══════════════════════════════════════╗    │
│     ║  DIAL UP DEPLOY                      ║    │  
│     ║  > Build sites with friends_         ║    │
│     ╚══════════════════════════════════════╝    │
│                                                 │
│     ┌─────────────────────────────────────┐     │
│     │ LOGIN                               │     │
│     │                                     │     │
│     │ Username: [________________]        │     │
│     │ Password: [________________]        │     │
│     │                                     │     │
│     │          [Login] [Register]         │     │
│     └─────────────────────────────────────┘     │
│                                                 │
│     Made with ❤️ in mono                        │
└─────────────────────────────────────────────────┘
```

### User Dashboard (After Login)
```
┌─────────────────────────────────────────────────┐
│ Hey user1! 👋                    [Settings] [⚡] │  
├─────────────────────────────────────────────────┤
│ YOUR SITES (2/3)                  [+ New Site]  │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────────────┐  ┌─────────────────────┐ │
│ │ my-portfolio        │  │ blog-site           │ │  
│ │ ────────────────────│  │ ────────────────────│ │
│ │ ✅ Running          │  │ ⏸️  Stopped          │ │
│ │ 🌐 portfolio.yours  │  │ 🌐 blog.yours       │ │
│ │ 📁 Static HTML      │  │ 📁 Astro            │ │
│ │ 💾 128MB RAM        │  │ 💾 0MB RAM          │ │
│ │                     │  │                     │ │
│ │ [Edit] [Deploy]     │  │ [Edit] [Start]      │ │
│ └─────────────────────┘  └─────────────────────┘ │
│                                                 │
│ USAGE: 128MB/512MB RAM • 0.2/0.5 CPU • 256MB/1GB │
└─────────────────────────────────────────────────┘
```

### Site Editor Interface (The Fun Part!)
```
┌─────────────────────────────────────────────────────────┐
│ < Back to Dashboard    my-portfolio               [💾]  │
├─────────────────┬───────────────────────────────────────┤
│ FILES           │ EDITOR: index.html                    │
│ ├─📁 assets     │                                       │
│ │  ├─🖼️ logo.png │ <!DOCTYPE html>                       │
│ │  └─📄 style.css│ <html lang="en">                     │
│ ├─📄 index.html │ <head>                                │
│ ├─📄 about.html │   <meta charset="UTF-8">              │
│ └─📄 contact.html│   <title>My Portfolio</title>        │
│                 │   <link rel="stylesheet"               │
│ [+ File] [+ Dir]│         href="assets/style.css">      │
│                 │ </head>                               │
│ TEMPLATES       │ <body>                                │
│ • Static HTML   │   <h1>Welcome to my site!</h1>        │
│ • Node.js       │   <p>This is built with</p>           │
│ • Astro         │   <code>Dial Up Deploy</code>          │
│ • React         │ </body>                               │
│                 │ </html>                               │
│                 │                                       │
│                 │                                       │
├─────────────────┼───────────────────────────────────────┤
│ CONSOLE OUTPUT  │ ACTIONS                               │
│ > Saved index.html                                      │
│ > File tree updated                          [Deploy]  │
│ > Ready for changes...                       [Preview] │
└─────────────────────────────────────────────────────────┘
```

### File Tree Interaction
```css
/* Fun hover effects */
.file-tree-item {
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-tree-item:hover {
  background: var(--hover);
  padding-left: 12px; /* Subtle slide effect */
}

.file-tree-item.active {
  background: var(--accent-blue);
  color: var(--bg-dark);
  font-weight: bold;
}
```

### New Site Creation Flow
```
STEP 1: Choose Template
┌─────────────────────────────────────────────────┐
│ 📄 Static HTML        Simple HTML/CSS/JS site   │
│ 🟢 Node.js           Basic Node.js application  │  
│ 🚀 Astro             Modern static site builder │
│ ⚛️  React             React app with Vite       │
└─────────────────────────────────────────────────┘

STEP 2: Site Details  
Site Name: [my-awesome-site________________]
Domain:    [my-awesome-site].yourdomain
Template:  Static HTML ✓

[Create Site & Open Editor]
```

## Mobile Responsive

### Admin (Mobile)
```
┌─────────────────┐
│ [☰] ADMIN  [⚙️] │
├─────────────────┤
│ Dashboard       │
│ Users (12)      │
│ Sites (24)      │  
│ Settings        │
│ Logs            │
├─────────────────┤
│                 │
│ Content slides  │
│ in from right   │
│                 │
└─────────────────┘
```

### Editor (Mobile)
```
┌─────────────────┐
│ [<] my-site [💾]│
├─────────────────┤
│ [📁] FILES      │ (Collapsible)
├─────────────────┤
│                 │
│ CodeMirror      │
│ takes full      │
│ width/height    │
│                 │
├─────────────────┤
│ [Deploy][Preview]│
└─────────────────┘
```

## Fun Interactive Elements

### Loading States
```
Deploying your site...
[████████████████████░░] 90%

Building files... ⚡
Running npm install... 📦
Starting server... 🚀
Done! ✨
```

### Success Messages
```
╔══════════════════════════════════════╗
║  🎉 Site deployed successfully!      ║
║  🌐 View at: my-site.yourdomain      ║  
║  ⚡ Build time: 2.3s                 ║
╚══════════════════════════════════════╝
```

### Error States
```
❌ Build failed
└─ npm install failed
   └─ package.json not found
   └─ 💡 Try adding a package.json file

[View Full Log] [Edit package.json]
```

This design maintains the fun, minimal aesthetic you want while being functional and terminal-inspired!