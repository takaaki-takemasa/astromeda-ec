// NOTE: https://shopify.dev/docs/api/customer/latest/mutations/customerUpdate
export const CUSTOMER_UPDATE_MUTATION = `#graphql
  mutation customerUpdate(
    $customer: CustomerUpdateInput!
    $language: LanguageCode
  ) @inContext(language: $language) {
    customerUpdate(input: $customer) {
      customer {
        firstName
        lastName
        emailAddress {
          emailAddress
        }
        phoneNumber {
          phoneNumber
        }
        metafields(identifiers: [
          {namespace: "facts", key: "birth_date"},
          {namespace: "custom", key: "gender"},
          {namespace: "custom", key: "referral_source"}
        ]) {
          key
          namespace
          value
        }
      }
      userErrors {
        code
        field
        message
      }
    }
  }
` as const;
