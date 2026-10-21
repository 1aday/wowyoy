import { startMockPostHog } from "./mock-posthog"

export default async function globalSetup() {
  const server = await startMockPostHog()
  return async () => {
    await new Promise((r) => server.close(r))
  }
}
