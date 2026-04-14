import {
  data as remixData,
  Form,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
} from 'react-router';
import type {Route} from './+types/account';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import {T, al} from '~/lib/astromeda-data';
import {isCustomerProfileComplete} from '~/routes/account.profile';

export const meta: Route.MetaFunction = () => [
  {name: 'robots', content: 'noindex, nofollow'},
];

export function shouldRevalidate() {
  return true;
}

export async function loader({context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  const {data, errors} = await customerAccount.query(CUSTOMER_DETAILS_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw new Error('Customer not found');
  }

  const profileComplete = isCustomerProfileComplete(data.customer);

  return remixData(
    {customer: data.customer, profileComplete},
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}

export default function AccountLayout() {
  const {customer, profileComplete} = useLoaderData<typeof loader>();
  const location = useLocation();
  const isOnProfilePage = location.pathname.includes('/account/profile');

  const heading = customer
    ? customer.firstName
      ? `${customer.firstName}さん、ようこそ`
      : `マイアカウント`
    : 'アカウント';

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
        padding: 'clamp(16px, 4vw, 48px)',
        paddingBottom: 'max(clamp(16px, 4vw, 48px), env(safe-area-inset-bottom, 0px))',
        maxWidth: 900,
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <h1
        className="ph"
        style={{
          fontSize: 'clamp(20px, 3vw, 28px)',
          fontWeight: 900,
          letterSpacing: 1,
          marginBottom: 'clamp(16px, 2vw, 24px)',
        }}
      >
        {heading}
      </h1>

      {/* プロフィール未完了バナー（プロフィールページ以外で表示） */}
      {!profileComplete && !isOnProfilePage && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            border: `1px solid ${al(T.g, 0.3)}`,
            background: al(T.g, 0.06),
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{fontSize: 22}}>⚠</span>
          <div style={{flex: 1, minWidth: 200}}>
            <div style={{fontWeight: 700, fontSize: 14, color: T.g, marginBottom: 4}}>
              プロフィールを完了してください
            </div>
            <div style={{fontSize: 12, color: T.t4}}>
              ご購入にはすべての必須項目の入力が必要です。
            </div>
          </div>
          <NavLink
            to="/account/profile"
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              background: T.g,
              color: '#000',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            プロフィールを完了する
          </NavLink>
        </div>
      )}

      {/* Navigation */}
      <AccountMenu />

      {/* Content */}
      <div style={{marginTop: 'clamp(20px, 3vw, 32px)'}}>
        <Outlet context={{customer}} />
      </div>
    </div>
  );
}

function AccountMenu() {
  const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    borderRadius: 10,
    border: `1px solid ${T.t2}`,
    background: T.bgC,
    color: T.t4,
    fontSize: 'clamp(11px, 1.3vw, 13px)',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'all .2s',
  };

  const activeLinkStyle: React.CSSProperties = {
    ...linkStyle,
    borderColor: al(T.c, 0.3),
    background: al(T.c, 0.06),
    color: T.c,
  };

  return (
    <nav
      role="navigation"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <NavLink
        to="/account/orders"
        style={({isActive}) => (isActive ? activeLinkStyle : linkStyle)}
      >
        注文履歴
      </NavLink>
      <NavLink
        to="/account/profile"
        style={({isActive}) => (isActive ? activeLinkStyle : linkStyle)}
      >
        プロフィール
      </NavLink>
      <NavLink
        to="/account/addresses"
        style={({isActive}) => (isActive ? activeLinkStyle : linkStyle)}
      >
        住所管理
      </NavLink>
      <Logout />
    </nav>
  );
}

function Logout() {
  return (
    <Form method="POST" action="/account/logout" style={{display: 'inline-flex'}}>
      <button
        type="submit"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 16px',
          borderRadius: 10,
          border: `1px solid ${al(T.r, 0.2)}`,
          background: al(T.r, 0.06),
          color: T.r,
          fontSize: 'clamp(11px, 1.3vw, 13px)',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all .2s',
        }}
      >
        ログアウト
      </button>
    </Form>
  );
}

export {RouteErrorBoundary as ErrorBoundary} from '~/components/astro/RouteErrorBoundary';
