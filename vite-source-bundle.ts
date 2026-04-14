/**
 * Vite Plugin: Source Bundle Generator
 * ビルド時にプロジェクトのソースファイルをスキャンし、
 * virtual:source-bundle として提供。ダッシュボードからのZIPダウンロードに使用。
 *
 * 医学メタファー: DNA転写 — ソースコード（遺伝子）をビルド成果物（RNA）に転写
 */

import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const VIRTUAL_MODULE_ID = 'virtual:source-bundle';
const RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID;

// バンドルに含めるファイルパターン
const INCLUDE_DIRS = [
  'app/routes',
  'app/components',
  'app/lib',
  'agents/core',
  'agents/teams',
  // agents/tests → archive/legacy-tests/ に移動済み
];

const INCLUDE_ROOT_FILES = [
  'server.ts',
  'vite.config.ts',
  'package.json',
  'tsconfig.json',
  'CLAUDE.md',
  'vite-source-bundle.ts',
];

const INCLUDE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css',
]);

const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  '.cache',
  '__generated__',
];

function shouldInclude(filePath: string): boolean {
  if (EXCLUDE_PATTERNS.some(p => filePath.includes(p))) return false;
  const ext = path.extname(filePath);
  return INCLUDE_EXTENSIONS.has(ext);
}

function scanDirectory(dirPath: string, basePath: string): Array<{ relativePath: string; content: string }> {
  const results: Array<{ relativePath: string; content: string }> = [];

  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

    if (EXCLUDE_PATTERNS.some(p => entry.name.includes(p))) continue;

    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, basePath));
    } else if (entry.isFile() && shouldInclude(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // 50KB以上のファイルはスキップ（バンドルサイズ制限）
        if (content.length <= 50_000) {
          results.push({ relativePath, content });
        }
      } catch { /* 読めないファイルはスキップ */ }
    }
  }

  return results;
}

export function sourceBundlePlugin(): Plugin {
  return {
    name: 'vite-source-bundle',
    resolveId(id: string) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_ID;
    },
    load(id: string) {
      if (id !== RESOLVED_ID) return;

      const basePath = process.cwd();
      const files: Array<{ relativePath: string; content: string }> = [];

      // ディレクトリスキャン
      for (const dir of INCLUDE_DIRS) {
        const dirPath = path.join(basePath, dir);
        files.push(...scanDirectory(dirPath, basePath));
      }

      // ルートファイル
      for (const fileName of INCLUDE_ROOT_FILES) {
        const filePath = path.join(basePath, fileName);
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.length <= 50_000) {
              files.push({ relativePath: fileName, content });
            }
          } catch { /* skip */ }
        }
      }

      const bundle = {
        generatedAt: new Date().toISOString(),
        projectName: 'astromeda-ec',
        fileCount: files.length,
        files: files.map(f => ({
          path: f.relativePath,
          size: f.content.length,
          content: f.content,
        })),
      };

      return `export default ${JSON.stringify(bundle)};`;
    },
  };
}
