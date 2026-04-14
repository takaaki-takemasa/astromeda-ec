const token = '9d4f49c05d1373832b46fedab6110962';
const domain = 'staging-mining-base.myshopify.com';

const queries = {
  collections: `{
    collections(first: 50) {
      edges {
        node {
          handle
          title
          productsCount {
            count
          }
        }
      }
    }
  }`,
  
  productsRTX: `{
    products(first: 50, query: "title:RTX") {
      edges {
        node {
          title
          handle
          availableForSale
          priceRange {
            minVariantPrice {
              amount
            }
          }
          variants(first: 5) {
            edges {
              node {
                title
                availableForSale
                price {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }`,

  products4070: `{
    products(first: 10, query: "title:4070") {
      edges {
        node {
          title
          availableForSale
          handle
        }
      }
    }
  }`,

  products5070: `{
    products(first: 10, query: "title:5070") {
      edges {
        node {
          title
          availableForSale
          handle
        }
      }
    }
  }`,

  productsGaming: `{
    products(first: 50, query: "title:ゲーミング") {
      edges {
        node {
          title
          handle
          availableForSale
          priceRange {
            minVariantPrice {
              amount
            }
          }
        }
      }
    }
  }`
};

async function runQueries() {
  for (const [name, query] of Object.entries(queries)) {
    try {
      const response = await fetch(`https://${domain}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': token
        },
        body: JSON.stringify({ query })
      });

      const data = await response.json();
      console.log(`\n=== ${name.toUpperCase()} ===`);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Error for ${name}:`, err.message);
    }
  }
}

runQueries();
