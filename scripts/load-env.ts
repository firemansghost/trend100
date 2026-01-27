/**
 * Load environment variables from .env.local and .env files
 * 
 * Loads in order: .env.local then .env
 * Uses override: false to ensure existing process.env values (from CI) are not overridden
 * 
 * IMPORTANT: This module auto-runs loadEnv() when imported (side-effect import).
 * In ESM, imports are evaluated before top-level code, so any module that reads
 * process.env during import-time will miss env vars if we don't load them immediately.
 * Scripts should import this FIRST: import './load-env';
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnv(): void {
  const candidates = ['.env.local', '.env'];
  
  for (const candidate of candidates) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) {
      config({ path, override: false });
    }
  }
}

// Auto-run when imported (side-effect module for ESM import order)
loadEnv();
