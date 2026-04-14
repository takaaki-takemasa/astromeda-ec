// Shopify Customer Account API: metafieldsSet mutation
// https://shopify.dev/docs/api/customer/latest/mutations/metafieldsSet
export const CUSTOMER_METAFIELDS_SET_MUTATION = `#graphql
  mutation customerMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        namespace
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

// Query to get the current customer's GID (required as ownerId for metafieldsSet)
export const CUSTOMER_ID_QUERY = `#graphql
  query customerId {
    customer {
      id
    }
  }
` as const;
