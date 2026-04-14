/**
 * ステージング全ページ動作確認スクリプト
 * #99: デプロイ後の全ルートHTTPステータス+基本内容検証
 *
 * 使用方法: npx tsx scripts/staging-check.ts
 */

const BASE_URL = 'https://01kn76gjfr62eckh2n0za2p26c-48a1974bca92d5b3444d.myshopify.dev';

interface CheckResult {
  url: string;
  status: number;
  ok: boolean;
  contentLength: number;
  hasExpectedContent: boolean;
  error?: string;
}

const ROUTES_TO_CHECK = [
  { path: '/', expect: 'Astromeda' },
  { path: '/collections', expect: '' },
  { path: '/collections/all', expect: '' },
  { path: '/collections/one-piece-bountyrush-collaboration', expect: '' },
  { path: '/collections/naruto-shippuden', expect: '' },
  { path: '/collections/sanrio-characters-collaboration', expect: '' },
  { path: '/cart', expect: '' },
  { path: '/faq', expect: 'FAQ' },
  { path: '/guides', expect: '' },
  { path: '/guides/beginners', expect: '' },
  { path: '/guides/cospa', expect: '' },
  { path: '/guides/streaming', expect: '' },
  { path: '/gift-cards', expect: '' },
  { path: '/wishlist', expect: '' },
  { path: '/search', expect: '' },
  { path: '/admin', expect: '' }, // 401 expected
  { path: '/sitemap/sitemap.xml', expect: '' },
  // 存在しないページ → 404カスタムページ
  { path: '/this-page-does-not-exist-12345', expect: '' },
];

async function checkRoute(path: string, expectedContent: string): Promise<CheckResult> {
  const url = `${BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Astromeda-Staging-Check/1.0' },
    });

    const text = await response.text();
    const hasExpectedContent = expectedContent
      ? text.toLowerCase().includes(expectedContent.toLowerCase())
      : true;

    return {
      url: path,
      status: response.status,
      ok: response.ok || response.status === 401 || response.status === 404,
      contentLength: text.length,
      hasExpectedContent,
    };
  } catch (error) {
    return {
      url: path,
      status: 0,
      ok: false,
      contentLength: 0,
      hasExpectedContent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('=== Astromeda ステージング全ページ動作確認 ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`チェック対象: ${ROUTES_TO_CHECK.length} ルート\n`);

  const results: CheckResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const route of ROUTES_TO_CHECK) {
    const result = await checkRoute(route.path, route.expect);
    results.push(result);

    const statusIcon = result.ok ? '✅' : '❌';
    const contentIcon = result.hasExpectedContent ? '📄' : '⚠️';

    if (result.ok && result.hasExpectedContent) {
      passed++;
    } else {
      failed++;
    }

    console.log(
      `${statusIcon} ${contentIcon} [${result.status}] ${result.url} (${result.contentLength} bytes)${result.error ? ` — ${result.error}` : ''}`,
    );
  }

  console.log(`\n=== 結果サマリー ===`);
  console.log(`合格: ${passed}/${results.length}`);
  console.log(`不合格: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\n❌ 不合格ルート:');
    for (const r of results.filter((x) => !x.ok || !x.hasExpectedContent)) {
      console.log(`  - [${r.status}] ${r.url}${r.error ? `: ${r.error}` : ''}`);
    }
  }

  console.log(`\n${failed === 0 ? '✅ 全ルート合格！Go判定可能。' : '❌ 修正が必要です。No-Go。'}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
