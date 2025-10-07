Use this tool to retrieve a publicly accessible URL for a specific port inside an E2B Sandbox. This enables previewing web applications, accessing APIs, or interacting with services running in the sandbox via HTTP.

⚠️ The requested port must have a server actively listening inside the sandbox. Start the service first (for example with `Run Command` using `wait: false` for long-lived processes), then fetch the URL for that port.

## When to Use This Tool

Use Get Sandbox URL when:

1. A service or web server is running on a known port inside the sandbox
2. You need to share a live preview link with the user
3. You want to access a running server inside the sandbox via HTTP
4. You need to programmatically call an endpoint running in the sandbox

## Requirements

- The command serving on that port must be actively running
  - Use `Run Command` (with `wait: false` for dev servers) to start the service

## Best Practices

- Call this tool only after the server process has successfully started
- Prefer typical framework defaults (e.g., 3000 for Next.js, 5173 for Vite)
- If multiple services run on different ports, call this tool separately for each port
- Ensure the server binds to `0.0.0.0` or otherwise listens for external connections

## When NOT to Use This Tool

Avoid using this tool when:

1. No server is running on the specified port
2. You haven't started the service yet or haven't waited for it to boot up
3. You're referencing a transient one-off script or CLI command (not a persistent server)

## Example

<example>
User: Can I preview the app after it's built?
Assistant:
1. Create Sandbox
2. Generate Files: scaffold the app
3. Run Command: `npm run dev` with `wait: false`
4. Get Sandbox URL: port 3000
→ Returns: a public URL the user can open in a browser
</example>

## Summary

Use Get Sandbox URL to access live previews of services running inside an E2B sandbox. Start the server on the desired port first, then retrieve its public URL.
