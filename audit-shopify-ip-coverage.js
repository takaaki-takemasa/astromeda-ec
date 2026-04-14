#!/usr/bin/env node

/**
 * Shopify IP Collaboration Product Coverage Audit
 *
 * Usage:
 *   node audit-shopify-ip-coverage.js
 *   node audit-shopify-ip-coverage.js --output audit-report.json
 *
 * This script queries the Shopify Storefront API to audit product coverage
 * across IP collaboration collections vs. actual store inventory.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const STORE = 'staging-mining-base.myshopify.com';
const TOKEN = '9d4f49c05d1373832b46fedab6110962';
const ENDPOINT = `https://${STORE}/api/2024-01/graphql.json`;

// IP Collection Handles (from astromeda-data.ts COLLABS array)
const IP_HANDLES = {
  'ONE PIECE バウンティラッシュ': 'one-piece-bountyrush-collaboration',
  'NARUTO-ナルト- 疾風伝': 'naruto-shippuden',
  '僕のヒーローアカデミア': 'heroaca-collaboration',
  'ストリートファイター6': 'streetfighter-collaboration',
  'サンリオキャラクターズ': 'sanrio-characters-collaboration',
  'ソニック・ザ・ヘッジホッグ': 'sega-sonic-astromeda-collaboration',
  '呪術廻戦': 'jujutsukaisen-collaboration',
  'チェンソーマン レゼ篇': 'chainsawman-movie-reze',
  'ぼっち・ざ・ろっく！': 'bocchi-rocks-collaboration',
  'hololive English': 'hololive-english-collaboration',
  'BLEACH Rebirth of Souls': 'bleach-rebirth-of-souls-collaboration',
  'BLEACH 千年血戦篇': 'bleach-anime-astromeda-collaboration',
  'コードギアス 反逆のルルーシュ': 'geass-collaboration',
  '東京喰種トーキョーグール': 'tokyoghoul-collaboration',
};

// IP Search Keywords
const IP_KEYWORDS = {
  'ONE PIECE バウンティラッシュ': ['ONE PIECE', 'ワンピース', 'バウンティラッシュ'],
  'NARUTO-ナルト- 疾風伝': ['NARUTO', 'ナルト', '疾風伝'],
  '僕のヒーローアカデミア': ['ヒーローアカデミア', 'ヒロアカ', 'デク', '爆豪', '轟'],
  'ストリートファイター6': ['ストリートファイター', 'Street Fighter', 'SF6'],
  'サンリオキャラクターズ': ['サンリオ', 'キティ', 'ハローキティ'],
  'ソニック・ザ・ヘッジホッグ': ['ソニック', 'Sonic', 'シャドウ'],
  '呪術廻戦': ['呪術廻戦', 'じゅじゅつかいせん', 'Jujutsu Kaisen'],
  'チェンソーマン レゼ篇': ['チェンソーマン', 'レゼ篇', 'Chainsaw Man'],
  'ぼっち・ざ・ろっく！': ['ぼっち', 'ぼざろ', 'Bocchi'],
  'hololive English': ['hololive', 'ホロライブ', '英語圏'],
  'BLEACH Rebirth of Souls': ['BLEACH', 'ブリーチ', 'Rebirth'],
  'BLEACH 千年血戦篇': ['BLEACH', '千年血戦篇', 'Thousand-Year'],
  'コードギアス 反逆のルルーシュ': ['コードギアス', 'ルルーシュ', 'Code Geass'],
  '東京喰種トーキョーグール': ['東京喰種', 'トーキョーグール', 'Tokyo Ghoul'],
};

/**
 * Execute GraphQL query against Shopify Storefront API
 */
async function invokeGraphQLQuery(query) {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': TOKEN,
      },
      body: JSON.stringify({ query }),
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }

    return data;
  } catch (error) {
    console.error(`❌ GraphQL Query Failed: ${error.message}`);
    return null;
  }
}

/**
 * Get all products in a collection by handle
 */
async function getCollectionProducts(handle) {
  const query = `
    {
      collectionByHandle(handle: "${handle}") {
        id
        title
        handle
        products(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            productType
            tags
            vendor
            handle
            variants(first: 1) {
              nodes {
                id
                sku
              }
            }
          }
        }
      }
    }
  `;

  return invokeGraphQLQuery(query);
}

/**
 * Search for products by keyword
 */
async function searchProductsByKeyword(keyword) {
  const escapedKeyword = keyword.replace(/"/g, '\\"');
  const query = `
    {
      products(first: 50, query: "${escapedKeyword}") {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          productType
          tags
          vendor
          handle
          collections(first: 10) {
            nodes {
              handle
              title
            }
          }
          variants(first: 1) {
            nodes {
              id
              sku
            }
          }
        }
      }
    }
  `;

  return invokeGraphQLQuery(query);
}

/**
 * Main audit execution
 */
async function invokeIPAudit() {
  console.log('\n=== Shopify IP Collaboration Product Coverage Audit ===');
  console.log(`Store: ${STORE}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  const auditResults = [];
  let totalOrphaned = 0;
  let totalIPs = 0;

  for (const [ip, handle] of Object.entries(IP_HANDLES)) {
    totalIPs++;

    console.log(`📊 Auditing: ${ip}`);
    console.log(`   Handle: ${handle}`);

    // Get collection products
    process.stdout.write('   → Fetching collection products... ');
    const collectionResult = await getCollectionProducts(handle);

    if (!collectionResult || collectionResult.errors) {
      console.log('❌ FAILED');
      console.error(`      Error: ${JSON.stringify(collectionResult?.errors)}`);
      continue;
    }

    const collection = collectionResult.data.collectionByHandle;
    const collectionProducts = collection?.products?.nodes || [];
    const collectionCount = collectionProducts.length;
    console.log(`✓ [${collectionCount} products]`);

    // Search for products by keywords
    process.stdout.write('   → Searching by keywords... ');
    const keywords = IP_KEYWORDS[ip];
    const allSearchProducts = [];

    for (const keyword of keywords) {
      const searchResult = await searchProductsByKeyword(keyword);
      if (searchResult?.data?.products?.nodes) {
        allSearchProducts.push(...searchResult.data.products.nodes);
      }
    }

    // Deduplicate by ID
    const uniqueSearchProducts = Array.from(
      new Map(allSearchProducts.map(p => [p.id, p])).values()
    );
    const totalSearchCount = uniqueSearchProducts.length;
    console.log(`✓ [${totalSearchCount} products]`);

    // Find orphaned products
    const collectionIds = new Set(collectionProducts.map(p => p.id));
    const orphanedProducts = uniqueSearchProducts.filter(
      p => !collectionIds.has(p.id)
    );
    const orphanCount = orphanedProducts.length;

    if (orphanCount > 0) {
      console.log(`   ⚠️  WARNING: ${orphanCount} products NOT in collection!`);
      totalOrphaned += orphanCount;
    }

    // Calculate coverage
    const coverage =
      totalSearchCount > 0
        ? Math.round((collectionCount / totalSearchCount) * 100 * 10) / 10
        : 0;

    // Build result
    const result = {
      name: ip,
      handle: handle,
      collectionProductCount: collectionCount,
      keywordSearchCount: totalSearchCount,
      orphanedCount: orphanCount,
      orphanedProducts: orphanedProducts.map(p => ({
        title: p.title,
        handle: p.handle,
        sku: p.variants?.nodes?.[0]?.sku || 'N/A',
      })),
      coveragePercent: coverage,
      collectionSample: collectionProducts
        .slice(0, 3)
        .map(p => ({
          title: p.title,
          handle: p.handle,
        })),
    };

    auditResults.push(result);
    console.log(`   ✅ Coverage: ${coverage}%\n`);
  }

  // Generate summary
  const avgCoverage =
    auditResults.length > 0
      ? Math.round(
          (auditResults.reduce((sum, r) => sum + r.coveragePercent, 0) /
            auditResults.length) *
            10
        ) / 10
      : 0;

  const summary = {
    auditDate: new Date().toISOString(),
    store: STORE,
    totalIPsAudited: totalIPs,
    totalOrphanedProducts: totalOrphaned,
    averageCoveragePercent: avgCoverage,
    ips: auditResults,
  };

  // Output summary
  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Total IPs Audited: ${totalIPs}`);
  console.log(`Total Orphaned Products: ${totalOrphaned}`);
  console.log(`Average Coverage: ${avgCoverage}%\n`);

  return summary;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const results = await invokeIPAudit();

    // Check for --output flag
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex > -1 && process.argv[outputIndex + 1]) {
      const outputPath = process.argv[outputIndex + 1];
      console.log(`💾 Saving report to: ${outputPath}`);
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
      console.log('✅ Report saved successfully\n');
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Audit failed: ${error.message}`);
    process.exit(1);
  }
}

// Execute
main();
