/**
 * PCカスタマイズオプション商品を全販売チャネルに公開するスクリプト
 *
 * Storefront APIからアクセスできるようにするため。
 * REST API の published_scope: "global" で全チャネルに公開。
 *
 * 使い方:
 *   node scripts/publish-customization-product.js [staging|production]
 */
import https from 'https';

const ENV = process.argv[2] || 'staging';

const STORES = {
  staging: {
    hostname: 'staging-mining-base.myshopify.com',
    token: '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'
  },
  production: {
    hostname: 'production-mining-base.myshopify.com',
    token: ''
  }
};

const PRODUCT_ID = 10415099380004;

const store = STORES[ENV];
if (!store || !store.token) {
  console.error('Token not set for env:', ENV);
  process.exit(1);
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: store.hostname,
      port: 443,
      path: `/admin/api/2024-10${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': store.token,
      }
    };
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log(`\n=== ${ENV}: Publish product ${PRODUCT_ID} to all channels ===\n`);

  // Step 1: Get current product info
  console.log('1. Checking current product...');
  const getRes = await apiRequest('GET', `/products/${PRODUCT_ID}.json`);
  if (getRes.status !== 200) {
    console.error('   Product not found:', getRes.status);
    process.exit(1);
  }
  const product = getRes.data.product;
  console.log('   Title:', product.title);
  console.log('   Handle:', product.handle);
  console.log('   Status:', product.status);
  console.log('   Published scope:', product.published_scope);
  console.log('   Published at:', product.published_at);

  // Step 2: Update to published_scope: "global" (all channels)
  if (product.published_scope === 'global') {
    console.log('\n2. Already published to all channels (global scope)!');
  } else {
    console.log(`\n2. Updating published_scope from "${product.published_scope}" to "global"...`);
    const updateRes = await apiRequest('PUT', `/products/${PRODUCT_ID}.json`, {
      product: {
        id: PRODUCT_ID,
        published_scope: 'global',
        published: true
      }
    });
    console.log('   HTTP Status:', updateRes.status);
    if (updateRes.status === 200) {
      console.log('   New scope:', updateRes.data.product.published_scope);
      console.log('   Published at:', updateRes.data.product.published_at);
    } else {
      console.error('   Error:', JSON.stringify(updateRes.data, null, 2));
    }
  }

  // Step 3: Verify via Storefront API
  console.log('\n3. Verifying Storefront API access...');
  const handle = product.handle;
  console.log('   Querying handle:', handle);

  const sfQuery = JSON.stringify({
    query: `{ product(handle: "${handle}") { id title variants(first: 3) { nodes { id sku title price { amount } } } } }`
  });

  const sfRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: store.hostname,
      port: 443,
      path: '/api/2024-10/graphql.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': '9d4f49c05d1373832b46fedab6110962',
        'Content-Length': Buffer.byteLength(sfQuery)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data.substring(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.write(sfQuery);
    req.end();
  });

  if (sfRes.data && sfRes.data.product) {
    console.log('   Storefront API: FOUND!');
    console.log('   Product:', sfRes.data.product.title);
    console.log('   Variants sample:');
    sfRes.data.product.variants.nodes.forEach(v => {
      console.log(`     - ${v.sku}: ${v.title} (${v.price.amount} JPY)`);
    });
  } else {
    console.log('   Storefront API: NOT FOUND (null)');
    console.log('   Response:', JSON.stringify(sfRes, null, 2));
    console.log('\n   NOTE: It may take 1-2 minutes for publication to propagate.');
    console.log('   Try running this script again in a minute to re-verify.');
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
