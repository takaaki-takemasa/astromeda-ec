/**
 * PCカスタマイズオプション商品をShopify Admin APIで一括作成するスクリプト
 *
 * 使い方:
 *   node scripts/create-customization-product.js [staging|production]
 *
 * デフォルトはstaging。productionの場合は本番トークンを設定してください。
 */
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));

const ENV = process.argv[2] || 'staging';

const STORES = {
  staging: {
    hostname: 'staging-mining-base.myshopify.com',
    token: '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'
  },
  production: {
    hostname: 'production-mining-base.myshopify.com',
    token: '' // ← 本番のAdmin APIトークンをここに設定
  }
};

const store = STORES[ENV];
if (!store) {
  console.error('Unknown env:', ENV, '(use "staging" or "production")');
  process.exit(1);
}
if (!store.token) {
  console.error(`${ENV}のAdmin APIトークンが未設定です。`);
  console.error('Shopify管理画面 → 設定 → アプリ → アプリを開発する → カスタムアプリを作成');
  console.error('→ Admin API access scopesで "write_products" を有効化 → トークンをコピー');
  process.exit(1);
}

console.log(`\n=== ${ENV}ストアに「PCカスタマイズオプション」商品を作成 ===\n`);

const productData = {
  product: {
    title: 'PCカスタマイズオプション',
    body_html: 'カスタマイズ選択時に自動追加される費用アイテム（非公開・検索非表示）',
    vendor: 'Astromeda',
    product_type: 'カスタマイズ',
    status: 'active',
    published: true,  // Storefront APIから取得可能にする
    tags: '_system, _customization, _hidden',
    variants: [
      { option1: 'メモリ: DDR5 非LED 64GB', price: '70000', sku: 'CUSTOM-MEM-64GB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'メモリ: DDR5 LED 32GB', price: '35000', sku: 'CUSTOM-MEM-LED32', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'メモリ: DDR5 LED 64GB', price: '105000', sku: 'CUSTOM-MEM-LED64', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'SSD1: 1TB NVMe Gen4', price: '20000', sku: 'CUSTOM-SSD1-1TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'SSD1: 2TB NVMe Gen4', price: '40000', sku: 'CUSTOM-SSD1-2TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'SSD1: 4TB NVMe Gen4', price: '90000', sku: 'CUSTOM-SSD1-4TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'SSD2: 1TB NVMe Gen4', price: '20000', sku: 'CUSTOM-SSD2-1TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'SSD2: 2TB NVMe Gen4', price: '40000', sku: 'CUSTOM-SSD2-2TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'SSD2: 4TB NVMe Gen4', price: '90000', sku: 'CUSTOM-SSD2-4TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'HDD: 2TB', price: '10000', sku: 'CUSTOM-HDD-2TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'HDD: 4TB', price: '15000', sku: 'CUSTOM-HDD-4TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'HDD: 8TB', price: '25000', sku: 'CUSTOM-HDD-8TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'HDD: 10TB', price: '55000', sku: 'CUSTOM-HDD-10TB', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: '電源: 750W BRONZE', price: '5000', sku: 'CUSTOM-PSU-750', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: '電源: 850W GOLD', price: '13000', sku: 'CUSTOM-PSU-850', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'ケーブル: ブラック', price: '6000', sku: 'CUSTOM-CABLE-BLK', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'ケーブル: ホワイト', price: '6000', sku: 'CUSTOM-CABLE-WHT', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'ケーブル: ピンク', price: '10000', sku: 'CUSTOM-CABLE-PNK', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'ケーブル: パープル', price: '10000', sku: 'CUSTOM-CABLE-PPL', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'ケーブル: オレンジ', price: '10000', sku: 'CUSTOM-CABLE-ORG', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'ケーブル: ゴールド', price: '12000', sku: 'CUSTOM-CABLE-GLD', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'マザーボードガード', price: '5000', sku: 'CUSTOM-MBGUARD', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'グリス: 13.2W/mK', price: '3000', sku: 'CUSTOM-GREASE-13', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'グリス: 16W/mK', price: '5000', sku: 'CUSTOM-GREASE-16', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'Microsoft Office', price: '35000', sku: 'CUSTOM-AIO', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'WiFi5 BT4.2', price: '3980', sku: 'CUSTOM-WIFI5', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'WiFi6E BT5.2', price: '6480', sku: 'CUSTOM-WIFI6E', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'Windows 11 Pro', price: '10000', sku: 'CUSTOM-WIN11PRO', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'キーボード: English', price: '3000', sku: 'CUSTOM-KB-EN', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'キーボード: 中国語', price: '3000', sku: 'CUSTOM-KB-CN', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: 'キーボード: 韓国語', price: '3000', sku: 'CUSTOM-KB-KR', requires_shipping: false, taxable: true, inventory_management: null },
      { option1: '組立手数料', price: '3300', sku: 'CUSTOM-ASSEMBLY', requires_shipping: false, taxable: true, inventory_management: null }
    ],
    options: [{ name: 'カスタマイズ内容' }]
  }
};

const body = JSON.stringify(productData);

const options = {
  hostname: store.hostname,
  port: 443,
  path: '/admin/api/2024-10/products.json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': store.token,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      if (json.product) {
        console.log('\n✅ 商品作成成功！');
        console.log('  Product ID:', json.product.id);
        console.log('  Handle:', json.product.handle);
        console.log('  Variants:', json.product.variants.length, '個');
        console.log('\n--- SKU → Variant ID マッピング ---');
        const mapping = {};
        json.product.variants.forEach(v => {
          mapping[v.sku] = {
            id: v.id,
            gid: 'gid://shopify/ProductVariant/' + v.id,
            title: v.title,
            price: v.price
          };
          console.log(`  ${v.sku} → ${v.id} (¥${parseInt(v.price).toLocaleString()})`);
        });
        // Save mapping to file for frontend use
        const mapFile = __dirname + '/../app/lib/customization-variants.json';
        fs.writeFileSync(mapFile, JSON.stringify({
          productId: json.product.id,
          productGid: 'gid://shopify/Product/' + json.product.id,
          handle: json.product.handle,
          env: ENV,
          variants: mapping
        }, null, 2));
        console.log('\n📁 マッピングファイル保存:', mapFile);
      } else {
        console.log('\n❌ エラー:', JSON.stringify(json, null, 2));
      }
    } catch(e) {
      console.log('Parse error:', e.message);
      console.log('Raw response:', data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});

req.write(body);
req.end();