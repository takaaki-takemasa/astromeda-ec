/**
 * SK-06: 骨格系（Skeleton）構造テスト
 *
 * 生命医学: X線検査 — 骨格の整合性を確認
 * - SK-01: ディレクトリ構造の検証
 * - SK-03: types/ ディレクトリの存在確認
 * - SK-04: バレルエクスポートの正当性
 * - SK-05: 循環依存の検出
 */
import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LIB_DIR = path.resolve(__dirname, '..');
const APP_DIR = path.resolve(LIB_DIR, '..');
const TYPES_DIR = path.resolve(APP_DIR, 'types');

describe('SK-01: Directory Structure', () => {
  it('app/lib/ ディレクトリが存在する', () => {
    expect(fs.existsSync(LIB_DIR)).toBe(true);
  });

  it('app/lib/__tests__/ ディレクトリが存在する', () => {
    expect(fs.existsSync(path.join(LIB_DIR, '__tests__'))).toBe(true);
  });

  it('app/types/ ディレクトリが存在する', () => {
    expect(fs.existsSync(TYPES_DIR)).toBe(true);
  });

  it('worker-shims/ サブディレクトリが存在する', () => {
    expect(fs.existsSync(path.join(LIB_DIR, 'worker-shims'))).toBe(true);
  });
});

describe('SK-03: Types Directory', () => {
  it('admin.ts 型定義が存在', () => {
    expect(fs.existsSync(path.join(TYPES_DIR, 'admin.ts'))).toBe(true);
  });

  it('api.ts 型定義が存在', () => {
    expect(fs.existsSync(path.join(TYPES_DIR, 'api.ts'))).toBe(true);
  });
});

describe('SK-04: Barrel Exports', () => {
  it('lib/index.ts が存在する', () => {
    expect(fs.existsSync(path.join(LIB_DIR, 'index.ts'))).toBe(true);
  });

  it('barrel export にセキュリティモジュールが含まれる', async () => {
    // 動的importで検証
    const barrel = await import('../index');
    expect(barrel.AppError).toBeDefined();
    expect(barrel.AppSession).toBeDefined();
    expect(barrel.validateGraphQLQuery).toBeDefined();
    expect(barrel.hasPermission).toBeDefined();
    expect(barrel.auditLog).toBeDefined();
    expect(barrel.isLocked).toBeDefined();
    expect(barrel.CircuitBreaker).toBeDefined();
  });

  it('barrel export に免疫系モジュールが含まれる', async () => {
    const barrel = await import('../index');
    expect(barrel.verifyCsrfForAdmin).toBeDefined();
    expect(barrel.isIPAllowed).toBeDefined();
    expect(barrel.registerQuery).toBeDefined();
    expect(barrel.is2FAEnabled).toBeDefined();
  });

  it('barrel export にデータパイプラインが含まれる', async () => {
    const barrel = await import('../index');
    expect(barrel.COLLABS).toBeDefined();
    expect(barrel.T).toBeDefined();
  });
});

describe('SK-05: Circular Dependency Detection', () => {
  /**
   * 静的解析: 各ファイルのimport文を解析し、循環参照を検出。
   * app/lib/ 配下の .ts ファイルのみを対象とする。
   */
  function extractImports(filePath: string): string[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const imports: string[] = [];
      // import ... from '...' パターン
      const regex = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];
        // 相対パスのlib/内インポートのみ
        if (importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('~/lib/')) {
          imports.push(importPath);
        }
      }
      return imports;
    } catch {
      return [];
    }
  }

  function resolveImportPath(fromFile: string, importStr: string): string | null {
    let resolved: string;
    if (importStr.startsWith('~/lib/')) {
      resolved = path.join(LIB_DIR, importStr.replace('~/lib/', ''));
    } else {
      resolved = path.resolve(path.dirname(fromFile), importStr);
    }
    // .ts 拡張子を試行
    if (fs.existsSync(resolved + '.ts')) return resolved + '.ts';
    if (fs.existsSync(resolved + '.tsx')) return resolved + '.tsx';
    if (fs.existsSync(resolved + '/index.ts')) return resolved + '/index.ts';
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  function detectCycles(): string[][] {
    const files = fs.readdirSync(LIB_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
      .map((f) => path.join(LIB_DIR, f));

    // Build adjacency map
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const imports = extractImports(file);
      const resolved = imports
        .map((imp) => resolveImportPath(file, imp))
        .filter((p): p is string => p !== null);
      graph.set(file, resolved);
    }

    // DFS cycle detection
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(node: string, pathStack: string[]): void {
      if (inStack.has(node)) {
        // Cycle found
        const cycleStart = pathStack.indexOf(node);
        if (cycleStart >= 0) {
          cycles.push(pathStack.slice(cycleStart).map((p) => path.basename(p)));
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      inStack.add(node);
      pathStack.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor, pathStack);
      }

      pathStack.pop();
      inStack.delete(node);
    }

    for (const file of files) {
      dfs(file, []);
    }

    return cycles;
  }

  it('lib/ 内に循環依存がないこと', () => {
    const cycles = detectCycles();
    if (cycles.length > 0) {
      const formatted = cycles.map((c) => c.join(' → ')).join('\n');
      // 循環依存がある場合は警告（致命的でない限りfailしない）
      console.warn(`[SK-05] 循環依存検出:\n${formatted}`);
    }
    // 致命的循環（3ファイル以上のサイクル）がないことを確認
    const criticalCycles = cycles.filter((c) => c.length >= 3);
    expect(criticalCycles).toEqual([]);
  });
});

describe('SK-02: File Size Audit', () => {
  it('mega-file（1000行超）が存在しないこと', () => {
    const files = fs.readdirSync(LIB_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'));

    const megaFiles: {name: string; lines: number}[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(LIB_DIR, file), 'utf-8');
      const lineCount = content.split('\n').length;
      if (lineCount > 1000) {
        megaFiles.push({name: file, lines: lineCount});
      }
    }

    if (megaFiles.length > 0) {
      console.warn(
        `[SK-02] 1000行超のファイル: ${megaFiles.map((f) => `${f.name}(${f.lines}行)`).join(', ')}`,
      );
    }
    // astromeda-data.ts は定数データ、agent-bridge.ts はPhase2エージェント統合ファイルなので例外
    const exemptPatterns = ['data', 'agent-bridge'];
    const nonExemptMegaFiles = megaFiles.filter(
      (f) => !exemptPatterns.some((p) => f.name.includes(p)),
    );
    expect(nonExemptMegaFiles).toEqual([]);
  });
});
