import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.planner.app",
  appName: "Planner",
  webDir: "dist",
  ios: {
    contentInset: "never",
    backgroundColor: "#000000",
  },
};

export default config;
