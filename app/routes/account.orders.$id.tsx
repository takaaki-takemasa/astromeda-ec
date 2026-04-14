import {redirect, useLoaderData} from 'react-router';
import type {Route} from './+types/account.orders.$id';
import {Money, Image} from '@shopify/hydrogen';
import type {
  OrderLineItemFullFragment,
  OrderQuery,
} from 'customer-accountapi.generated';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = ({data}) => {
  return [
    {title: `ASTROMEDA | 注文 ${data?.order?.name}`},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

export async function loader({params, context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  if (!params.id) {
    return redirect('/account/orders');
  }

  const orderId = atob(params.id);
  const {data, errors}: {data: OrderQuery; errors?: Array<{message: string}>} =
    await customerAccount.query(CUSTOMER_ORDER_QUERY, {
      variables: {
        orderId,
        language: customerAccount.i18n.language,
      },
    });

  if (errors?.length || !data?.order) {
    throw new Error('Order not found');
  }

  const {order} = data;

  // Extract line items directly from nodes array
  const lineItems = order.lineItems.nodes;

  // Extract discount applications directly from nodes array
  const discountApplications = order.discountApplications.nodes;

  // Get fulfillment status from first fulfillment node
  const fulfillmentStatus = order.fulfillments.nodes[0]?.status ?? '未発送';

  // Get first discount value with proper type checking
  const firstDiscount = discountApplications[0]?.value;

  // Type guard for MoneyV2 discount
  const discountValue =
    firstDiscount?.__typename === 'MoneyV2'
      ? (firstDiscount as Extract<
          typeof firstDiscount,
          {__typename: 'MoneyV2'}
        >)
      : null;

  // Type guard for percentage discount
  const discountPercentage =
    firstDiscount?.__typename === 'PricingPercentageValue'
      ? (
          firstDiscount as Extract<
            typeof firstDiscount,
            {__typename: 'PricingPercentageValue'}
          >
        ).percentage
      : null;

  return {
    order,
    lineItems,
    discountValue,
    discountPercentage,
    fulfillmentStatus,
  };
}

export default function OrderRoute() {
  const {
    order,
    lineItems,
    discountValue,
    discountPercentage,
    fulfillmentStatus,
  } = useLoaderData<typeof loader>();
  return (
    <div className="account-order">
      <h2>注文 {order.name}</h2>
      <p>注文日: {new Date(order.processedAt ?? '').toLocaleDateString('ja-JP')}</p>
      {order.confirmationNumber && (
        <p>確認番号: {order.confirmationNumber}</p>
      )}
      <br />
      <div>
        <table>
          <thead>
            <tr>
              <th scope="col">商品</th>
              <th scope="col">価格</th>
              <th scope="col">数量</th>
              <th scope="col">合計</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((lineItem, lineItemIndex) => (
              // eslint-disable-next-line react/no-array-index-key
              <OrderLineRow key={lineItemIndex} lineItem={lineItem} />
            ))}
          </tbody>
          <tfoot>
            {((discountValue && discountValue.amount) ||
              discountPercentage) && (
              <tr>
                <th scope="row" colSpan={3}>
                  <p>割引</p>
                </th>
                <th scope="row">
                  <p>割引</p>
                </th>
                <td>
                  {discountPercentage ? (
                    <span>-{discountPercentage}% OFF</span>
                  ) : (
                    discountValue && <Money data={discountValue} />
                  )}
                </td>
              </tr>
            )}
            <tr>
              <th scope="row" colSpan={3}>
                <p>小計</p>
              </th>
              <th scope="row">
                <p>小計</p>
              </th>
              <td>
                {order.subtotal && <Money data={order.subtotal} />}
              </td>
            </tr>
            <tr>
              <th scope="row" colSpan={3}>
                消費税
              </th>
              <th scope="row">
                <p>消費税</p>
              </th>
              <td>
                {order.totalTax && <Money data={order.totalTax} />}
              </td>
            </tr>
            <tr>
              <th scope="row" colSpan={3}>
                合計
              </th>
              <th scope="row">
                <p>合計</p>
              </th>
              <td>
                {order.totalPrice && <Money data={order.totalPrice} />}
              </td>
            </tr>
          </tfoot>
        </table>
        <div>
          <h3>配送先住所</h3>
          {order?.shippingAddress ? (
            <address>
              <p>{order.shippingAddress.name}</p>
              {order.shippingAddress.formatted ? (
                <p>{order.shippingAddress.formatted}</p>
              ) : (
                ''
              )}
              {order.shippingAddress.formattedArea ? (
                <p>{order.shippingAddress.formattedArea}</p>
              ) : (
                ''
              )}
            </address>
          ) : (
            <p>配送先住所が未設定です</p>
          )}
          <h3>ステータス</h3>
          <div>
            <p>{fulfillmentStatus}</p>
          </div>
        </div>
      </div>
      <br />
      <p>
        <a target="_blank" href={order.statusPageUrl} rel="noreferrer">
          注文状況を確認 →
        </a>
      </p>
    </div>
  );
}

function OrderLineRow({lineItem}: {lineItem: OrderLineItemFullFragment}) {
  return (
    <tr key={lineItem.id}>
      <td>
        <div>
          {lineItem?.image && (
            <div>
              <Image data={lineItem.image} alt={lineItem.image.altText || lineItem.title} width={96} height={96} />
            </div>
          )}
          <div>
            <p>{lineItem.title}</p>
            <small>{lineItem.variantTitle}</small>
          </div>
        </div>
      </td>
      <td>
        {lineItem.price && <Money data={lineItem.price} />}
      </td>
      <td>{lineItem.quantity}</td>
      <td>
        {lineItem.totalDiscount && <Money data={lineItem.totalDiscount} />}
      </td>
    </tr>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
