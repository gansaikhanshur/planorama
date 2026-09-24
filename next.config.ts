import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
export default function config(phase: string): NextConfig {
  let production = process.env.PLANORAMA_BUILD_DIRECTORY;
  if (!production) {
    try {
      production = JSON.parse(
        readFileSync(".planorama-build/planorama-build.json", "utf8"),
      ).directory;
    } catch {}
  }
  return {
    devIndicators: false,
    agentRules: false,
    distDir:
      phase === PHASE_DEVELOPMENT_SERVER
        ? ".next"
        : (production ?? ".planorama-build"),
    ...(process.env.PLANORAMA_BUILD_TSCONFIG
      ? { typescript: { tsconfigPath: process.env.PLANORAMA_BUILD_TSCONFIG } }
      : {}),
  };
}
