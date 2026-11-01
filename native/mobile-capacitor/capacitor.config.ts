import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Otama mobile shell. The app loads the hosted web app via server.url, so
 * shipping an update is just redeploying the website — the store binary only
 * changes when the shell itself changes.
 *
 * NOTE: server.url and androidScheme must stay in sync with the deployment.
 */
const config: CapacitorConfig = {
  appId: "space.otama.app",
  appName: "Otama",
  webDir: "www",
  server: {
    url: "https://otama2.space-z.ai",
    androidScheme: "https",
    // navigation stays inside the app; anything else opens the browser
    allowNavigation: ["otama2.space-z.ai"],
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
