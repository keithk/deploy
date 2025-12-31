# Notes
These are the things I'm makin ga note of while watching Claude edit. 

Run the development version of our application with `bun run build && bun link && deploy dev`

## Editor
https://editor.dev.deploy
src/editor

1. bug: when i make changes in the editor and click 'edit site' I'm getting:
```
[WARN] Cleaning up old session 54 to make room for new session
[WARN] No dynamic route found for session 54
```

in the terminal, and "⚠️ Error entering edit mode. Please try again." in the browser. 

I would expect to get sent to an edit URL, and the preview window open while the container is loading.

## Admin Panel
https://editor.dev.deploy
src/web/admin

