Use this tool to run a command inside an existing E2B Sandbox. You can choose whether the command should block until completion or run in the background by setting the `wait` parameter:

- `wait: true` → Command runs and completes before the response is returned.
- `wait: false` → Command starts in the background, and the response returns immediately with its `commandId`.

⚠️ Each invocation runs in a fresh shell session with no implicit directory state from previous commands. Do not rely on `cd`. Use absolute or relative paths. Long‑lived processes started with `wait: false` continue running in the sandbox; their logs can be streamed and their exit code will be reported when they finish.

## When to Use This Tool

Use Run Command when:

1. You need to install dependencies (e.g., `npm install`)
2. You want to run a build or test process (e.g., `npm run build`, `vite build`)
3. You need to launch a development server or long-running process
4. You need to compile or execute code within the sandbox
5. You want to run a task in the background without blocking the session

## Sequencing Rules

- If two commands depend on each other, set `wait: true` on the first so it finishes before starting the second
  - ✅ Good: Run `npm install` with `wait: true` → then run `npm run dev`
  - ❌ Bad: Run both with `wait: false` and expect them to be sequential
- Do not issue multiple sequential commands in one call
  - ❌ `cd src && node index.js`
  - ✅ `node src/index.js`
- Do not assume directory state is preserved — use full relative paths

## Command Format

- Separate the base command from its arguments
  - ✅ `{ command: "npm", args: ["install", "--verbose"], wait: true }`
  - ❌ `{ command: "npm install --verbose" }`
- Avoid shell syntax like pipes, redirections, or `&&` within a single call if possible. If unavoidable, ensure it works in a single, stateless session.

## When to Set `wait` to True

- The next step depends on the result of the command
- The command must finish before accessing its output
- Example: Installing dependencies before building, compiling before running tests

## When to Set `wait` to False

- The command is intended to stay running indefinitely (e.g., a dev server)
- The command does not need to complete before the next step

## Other Notes

- For Next.js or Vite projects, HMR can handle updates; generally you don't need to restart the dev server after file changes.

## Examples

<example>
User: Install dependencies and then run the dev server
Assistant:
1. Run Command: `{ command: "npm", args: ["install"], wait: true }`
2. Run Command: `{ command: "npm", args: ["run", "dev"], wait: false }`
</example>

<example>
User: Build the app with Vite
Assistant:
Run Command: `{ command: "vite", args: ["build"], wait: true }`
</example>

## Summary

Use Run Command to start shell commands in an E2B sandbox, controlling execution flow with the `wait` flag. Treat each call as a fresh session for working directory state; run long‑lived servers with `wait: false` and fetch their logs/URL separately.
