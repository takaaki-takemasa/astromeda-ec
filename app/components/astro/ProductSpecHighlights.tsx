/**
 * ProductSpecHighlights — 商品タイトル・タグからPCスペックを自動抽出して表示
 *
 * #61-63 商品説明最適化: Tier1-3全商品対応
 * - 商品タイトルからGPU/CPU/メモリ/ストレージを自動検出
 * - タグからカテゴリ（PC/ガジェット/グッズ）を判定
 * - PCの場合のみスペックハイライトを表示
 * - SEO向けProductスキーマの additionalProperty として出力可能
 */

import React from 'react';
import {T, al} from '~/lib/astromeda-data';

interface SpecItem {
  label: string;
  value: string;
  icon: string;
}

interface ProductSpecHighlightsProps {
  productTitle: string;
  productTags: string[];
  descriptionHtml?: string;
}

// GPU detection patterns
const GPU_PATTERNS = [
  /RTX\s*\d{4}\s*(Ti|SUPER|ti|super)?/i,
  /GTX\s*\d{4}\s*(Ti|SUPER)?/i,
  /RX\s*\d{4}\s*(XT|XTX)?/i,
  /Arc\s*[AB]\d{3}/i,
];

// CPU detection patterns
const CPU_PATTERNS = [
  /Core\s*Ultra\s*[3579]\s*\d{3,4}[A-Z]*/i,
  /Core\s*i[3579]-\d{4,5}[A-Z]*/i,
  /Core\s*i[3579]\s+\d{4,5}[A-Z]*/i,
  /Ryzen\s*[3579]\s*\d{4}[A-Z]*/i,
  /Ryzen\s*[3579]\s*\d{3,4}X3D/i,
];

// Memory detection — メモリXXGB or XXGB DDR5 形式に対応
const MEMORY_PATTERNS = [
  /メモリ\s*(\d{1,3})\s*GB/i,
  /(\d{1,3})\s*GB\s*(DDR[45])/i,
  /DDR[45]\s*[^\d]*(\d{1,3})\s*GB/i,
];

// Storage detection
const STORAGE_PATTERNS = [
  /(\d+)\s*TB\s*(SSD|NVMe|M\.2)?/i,
  /(\d+)\s*GB\s*SSD/i,
];

function extractSpecs(title: string, tags: string[], descriptionHtml?: string): SpecItem[] {
  const specs: SpecItem[] = [];
  // タイトルを優先（タイトルのスペック情報が最も正確）
  const titleText = title;
  const searchText = `${title} ${tags.join(' ')} ${descriptionHtml || ''}`;

  // GPU — タイトルから抽出
  for (const pattern of GPU_PATTERNS) {
    const match = titleText.match(pattern);
    if (match) {
      // GPUのVRAM表記（例: RTX 5060 Ti 8GB）を取得
      const gpuStr = match[0].trim();
      specs.push({label: 'GPU', value: gpuStr, icon: '🎮'});
      break;
    }
  }
  // タイトルに無ければ全テキストから
  if (specs.length === 0) {
    for (const pattern of GPU_PATTERNS) {
      const match = searchText.match(pattern);
      if (match) {
        specs.push({label: 'GPU', value: match[0].trim(), icon: '🎮'});
        break;
      }
    }
  }

  // CPU — タイトルから抽出
  let cpuFound = false;
  for (const pattern of CPU_PATTERNS) {
    const match = titleText.match(pattern);
    if (match) {
      specs.push({label: 'CPU', value: match[0].trim(), icon: '⚡'});
      cpuFound = true;
      break;
    }
  }
  if (!cpuFound) {
    for (const pattern of CPU_PATTERNS) {
      const match = searchText.match(pattern);
      if (match) {
        specs.push({label: 'CPU', value: match[0].trim(), icon: '⚡'});
        break;
      }
    }
  }

  // Memory — 「メモリXXGB」形式をまずタイトルから探す
  // GPUのVRAM (例: RTX 5060 Ti 8GB) と区別するため、
  // 「メモリ」キーワード付きのパターンを優先
  let memFound = false;
  const memTitleMatch = titleText.match(/メモリ\s*(\d{1,3})\s*GB/i);
  if (memTitleMatch) {
    const gb = parseInt(memTitleMatch[1], 10);
    if (gb >= 8 && gb <= 256) {
      specs.push({label: 'メモリ', value: `${gb}GB DDR5`, icon: '💾'});
      memFound = true;
    }
  }
  if (!memFound) {
    // タイトルのスラッシュ区切りから「メモリ」に続くGB数を探す
    const titleParts = titleText.split(/[\/／]/);
    for (const part of titleParts) {
      if (part.includes('メモリ') || part.match(/^\s*\d+GB\s*$/)) {
        const m = part.match(/(\d{1,3})\s*GB/i);
        if (m) {
          const gb = parseInt(m[1], 10);
          // GPUのVRAM(4GB,8GB,12GB,16GB,24GB)と区別:
          // メモリは通常16GB以上、VRAM直後のGB数は除外
          if (gb >= 16 && gb <= 256 && !part.match(/RTX|GTX|RX|Ti|SUPER/i)) {
            specs.push({label: 'メモリ', value: `${gb}GB DDR5`, icon: '💾'});
            memFound = true;
            break;
          }
        }
      }
    }
  }
  if (!memFound) {
    for (const pattern of MEMORY_PATTERNS) {
      const match = searchText.match(pattern);
      if (match) {
        const gb = parseInt(match[1], 10);
        if (gb >= 16 && gb <= 256) {
          const ddr = match[2] || 'DDR5';
          specs.push({label: 'メモリ', value: `${gb}GB ${ddr}`.trim(), icon: '💾'});
          break;
        }
      }
    }
  }

  // Storage
  for (const pattern of STORAGE_PATTERNS) {
    const match = titleText.match(pattern);
    if (match) {
      specs.push({label: 'ストレージ', value: match[0].trim(), icon: '💿'});
      break;
    }
  }
  // タイトルになければ全テキスト
  if (!specs.find((s) => s.label === 'ストレージ')) {
    for (const pattern of STORAGE_PATTERNS) {
      const match = searchText.match(pattern);
      if (match) {
        specs.push({label: 'ストレージ', value: match[0].trim(), icon: '💿'});
        break;
      }
    }
  }

  return specs;
}

function isPC(title: string, tags: string[]): boolean {
  const combined = `${title} ${tags.join(' ')}`.toLowerCase();
  // Exclude gadgets and goods
  const gadgetKeywords = ['マウスパッド', 'キーボード', 'パネル', 'pcケース', 'ケース'];
  const goodsKeywords = ['アクリル', 'tシャツ', 'パーカー', 'グッズ', 'ステッカー'];

  for (const kw of [...gadgetKeywords, ...goodsKeywords]) {
    if (combined.includes(kw)) return false;
  }

  // Check for PC indicators
  const pcKeywords = ['pc', 'デスクトップ', 'gaming', 'ゲーミング', 'rtx', 'gtx', 'ryzen', 'core i'];
  return pcKeywords.some((kw) => combined.includes(kw));
}

export function ProductSpecHighlights({
  productTitle,
  productTags,
  descriptionHtml,
}: ProductSpecHighlightsProps) {
  // Only show for PC products
  if (!isPC(productTitle, productTags)) {
    return null;
  }

  const specs = extractSpecs(productTitle, productTags, descriptionHtml);

  if (specs.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        background: al(T.c, 0.03),
        borderRadius: 14,
        border: `1px solid ${al(T.c, 0.1)}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: al(T.tx, 0.35),
          letterSpacing: 2,
          marginBottom: 10,
        }}
      >
        KEY SPECS
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(specs.length, 4)}, 1fr)`,
          gap: 12,
        }}
      >
        {specs.map((spec) => (
          <div
            key={spec.label}
            style={{
              textAlign: 'center',
              padding: '10px 6px',
              background: al(T.tx, 0.02),
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: al(T.tx, 0.4),
                marginBottom: 2,
              }}
            >
              {spec.label}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: T.c,
              }}
            >
              {spec.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
