/**
 * /apps/reviews/submit - レビュー投稿フォーム + 投稿エンドポイント
 *
 * GET:  ?token=XXX で投稿フォーム表示 (トークン検証 + 注文商品リスト プリフィル)
 * POST: multipart/form-data でレビュー投稿 (写真上限 6 枚・5MB/枚)
 *
 * セキュリティ:
 *  - トークン検証 (UUID v4 / expires_at / used_at)
 *  - レート制限 (IP ベース: 1 時間あたり 5 投稿)
 *  - status: 必ず 'pending' で作成 (承認制 / Schema 強制)
 *  - source_type: token_type から自動判定 (purchase→verified_purchase / gift→gift_recipient)
 *
 * Phase 3 / 2026-05-14
 */

import { data, redirect } from 'react-router';
import type { Route } from './+types/apps.reviews.submit';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';

const REVIEW_TYPE = 'astromeda_review';
const TOKEN_TYPE = 'astromeda_review_token';

// === Token 検証 ===
async function fetchToken(adminClient: any, token: string) {
  const query = `query($q:String!){
    metaobjects(type:"${TOKEN_TYPE}",first:1,query:$q){
      nodes{
        id handle
        fields{key value reference{...on Product{id handle title featuredImage{url}}}}
      }
    }
  }`;
  const r = await adminClient.graphql(query, { q: `fields.token:${token}` });
  const node = r?.data?.metaobjects?.nodes?.[0];
  if (!node) return null;
  const obj: any = { id: node.id, _refs: {} };
  for (const f of node.fields) {
    obj[f.key] = f.value;
    if (f.reference) obj._refs[f.key] = f.reference;
  }
  return obj;
}

function isExpired(expiresAt: string): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

function isUsed(usedAt: string | undefined): boolean {
  return !!usedAt && usedAt.trim() !== '';
}

// === LOADER (GET) ===
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || !/^[a-zA-Z0-9-]{8,64}$/.test(token)) {
    return data({ ok: false, error: 'INVALID_TOKEN_FORMAT' }, { status: 400 });
  }

  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  const admin = getAdminClient();

  const tok = await fetchToken(admin, token);
  if (!tok) return data({ ok: false, error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  if (isExpired(tok.expires_at)) return data({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 410 });
  if (isUsed(tok.used_at)) return data({ ok: false, error: 'TOKEN_ALREADY_USED' }, { status: 409 });

  // 商品リストを取得 (product_refs は list.product_reference)
  const productsRaw = tok.product_refs ? JSON.parse(tok.product_refs) : [];
  const productsQuery = `query($ids:[ID!]!){nodes(ids:$ids){...on Product{id handle title featuredImage{url}}}}`;
  const productsResp = await admin.graphql(productsQuery, { ids: productsRaw });
  const products = (productsResp?.data?.nodes || []).filter(Boolean);

  return data({
    ok: true,
    token,
    customer_name: tok.customer_name || '',
    token_type: tok.token_type,
    products,
  });
}

// === ACTION (POST) ===
export async function action({ request, context }: Route.ActionArgs) {
  // Rate limit (IP ベース)
  const rateLimitResp = await applyRateLimit(request, RATE_LIMIT_PRESETS.public, 'reviews-submit');
  if (rateLimitResp) return rateLimitResp;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    return data({ ok: false, error: 'INVALID_FORM' }, { status: 400 });
  }

  const token = String(formData.get('token') || '');
  const productId = String(formData.get('product_id') || '');
  const ratingRaw = String(formData.get('rating') || '');
  const title = String(formData.get('title') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const reviewerName = String(formData.get('reviewer_name') || '').trim();

  // 基本検証
  const rating = parseInt(ratingRaw, 10);
  if (!token) return data({ ok: false, error: 'TOKEN_REQUIRED' }, { status: 400 });
  if (!productId.startsWith('gid://shopify/Product/'))
    return data({ ok: false, error: 'INVALID_PRODUCT' }, { status: 400 });
  if (isNaN(rating) || rating < 1 || rating > 5)
    return data({ ok: false, error: 'INVALID_RATING' }, { status: 400 });
  if (!title || title.length > 60) return data({ ok: false, error: 'INVALID_TITLE' }, { status: 400 });
  if (!body || body.length > 1000) return data({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  if (!reviewerName) return data({ ok: false, error: 'NAME_REQUIRED' }, { status: 400 });

  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  const admin = getAdminClient();

  // Token 再検証
  const tok = await fetchToken(admin, token);
  if (!tok) return data({ ok: false, error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  if (isExpired(tok.expires_at)) return data({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 410 });
  if (isUsed(tok.used_at)) return data({ ok: false, error: 'TOKEN_ALREADY_USED' }, { status: 409 });

  // 商品所属検証 (productId が token.product_refs に含まれているか)
  const allowedProductRefs = tok.product_refs ? JSON.parse(tok.product_refs) : [];
  if (!allowedProductRefs.includes(productId))
    return data({ ok: false, error: 'PRODUCT_NOT_IN_TOKEN' }, { status: 403 });

  // 写真アップロード (最大 6 枚)
  const photoUrls: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const file = formData.get(`photo_${i}`) as File | null;
    if (!file || !(file instanceof File) || file.size === 0) continue;
    if (file.size > 5 * 1024 * 1024) {
      return data({ ok: false, error: `PHOTO_${i}_TOO_LARGE` }, { status: 413 });
    }
    if (!/^image\//.test(file.type)) {
      return data({ ok: false, error: `PHOTO_${i}_INVALID_TYPE` }, { status: 415 });
    }
    // Shopify Files API へ upload
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const stageQuery = `mutation($input:[StagedUploadInput!]!){
      stagedUploadsCreate(input:$input){
        stagedTargets{url resourceUrl parameters{name value}}
        userErrors{message}
      }
    }`;
    const stage = await admin.graphql(stageQuery, {
      input: [
        {
          filename: `review-${token.slice(0, 8)}-${i}-${Date.now()}.${file.type.split('/')[1] || 'jpg'}`,
          mimeType: file.type,
          resource: 'IMAGE' as any,
          httpMethod: 'POST' as any,
        },
      ],
    });
    const target = stage?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) return data({ ok: false, error: `PHOTO_${i}_STAGE_FAILED` }, { status: 500 });

    // POST file to staged URL (multipart)
    const fd = new FormData();
    for (const p of target.parameters) fd.append(p.name, p.value);
    fd.append('file', new Blob([arrayBuffer], { type: file.type }));
    const uploadResp = await fetch(target.url, { method: 'POST', body: fd });
    if (!uploadResp.ok) return data({ ok: false, error: `PHOTO_${i}_UPLOAD_FAILED` }, { status: 500 });

    // fileCreate で Shopify Files に登録
    const createFileMut = `mutation($files:[FileCreateInput!]!){
      fileCreate(files:$files){files{... on MediaImage{id image{url}}} userErrors{message}}
    }`;
    const created = await admin.graphql(createFileMut, {
      files: [{ alt: title.slice(0, 50), contentType: 'IMAGE' as any, originalSource: target.resourceUrl }],
    });
    const fileId = created?.data?.fileCreate?.files?.[0]?.id;
    if (fileId) photoUrls.push(fileId);
  }

  // 商品情報取得 (collection_tags 自動付与のため)
  const prodQuery = `query($id:ID!){product(id:$id){collections(first:50){edges{node{handle}}}}}`;
  const pr = await admin.graphql(prodQuery, { id: productId });
  const collectionTags = pr?.data?.product?.collections?.edges?.map((e: any) => e.node.handle) || [];

  // source_type 判定 (token_type から)
  const sourceType = tok.token_type === 'gift' ? 'gift_recipient' : 'verified_purchase';

  // Metaobject 作成 (status: pending 強制)
  const fields: { key: string; value: string }[] = [
    { key: 'product_ref', value: productId },
    { key: 'rating', value: String(rating) },
    { key: 'title', value: title },
    { key: 'body', value: body },
    { key: 'reviewer_name', value: reviewerName.slice(0, 100) },
    { key: 'reviewer_email', value: tok.email || '' },
    { key: 'source_type', value: sourceType },
    { key: 'status', value: 'pending' }, // ★ 必ず pending
    { key: 'collection_tags', value: JSON.stringify(collectionTags) },
    { key: 'helpful_count', value: '0' },
  ];
  if (tok.order_id) fields.push({ key: 'order_id', value: tok.order_id });
  if (tok.token_type === 'gift') fields.push({ key: 'gift_token_id', value: tok.id });

  // Photo 紐付け
  photoUrls.forEach((fid, idx) => {
    fields.push({ key: `photo_${idx + 1}`, value: fid });
  });

  const createMut = `mutation($mo:MetaobjectCreateInput!){
    metaobjectCreate(metaobject:$mo){metaobject{id} userErrors{field message code}}
  }`;
  const createR = await admin.graphql(createMut, { mo: { type: REVIEW_TYPE, fields } });
  const created = createR?.data?.metaobjectCreate;
  if (!created?.metaobject) {
    return data(
      { ok: false, error: 'CREATE_FAILED', detail: created?.userErrors },
      { status: 500 },
    );
  }
  const reviewId = created.metaobject.id;

  // Token を used_at で消費 (再投稿防止)
  const updateTokenMut = `mutation($id:ID!,$mo:MetaobjectUpdateInput!){
    metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id} userErrors{message}}
  }`;
  await admin.graphql(updateTokenMut, {
    id: tok.id,
    mo: { fields: [{ key: 'used_at', value: new Date().toISOString() }] },
  });

  // 商品 metafield custom.reviews に追加 (承認時にのみ表示されるが、レコードは紐付ける)
  // 注: 表示は Liquid 側で status=approved フィルタするため、pending でも追加 OK
  const fetchMfQuery = `query($id:ID!){product(id:$id){metafield(namespace:"custom",key:"reviews"){value}}}`;
  const mfResp = await admin.graphql(fetchMfQuery, { id: productId });
  const existing = mfResp?.data?.product?.metafield?.value
    ? JSON.parse(mfResp.data.product.metafield.value)
    : [];
  existing.push(reviewId);

  const setMfMut = `mutation($metafields:[MetafieldsSetInput!]!){
    metafieldsSet(metafields:$metafields){metafields{id} userErrors{message}}
  }`;
  await admin.graphql(setMfMut, {
    metafields: [
      {
        ownerId: productId,
        namespace: 'custom',
        key: 'reviews',
        type: 'list.metaobject_reference',
        value: JSON.stringify(existing),
      },
    ],
  });

  return redirect('/apps/reviews/complete');
}

// === UI ===
export default function ReviewSubmit({ loaderData }: Route.ComponentProps) {
  if (!loaderData.ok) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>❌</div>
        <h1 style={{ fontSize: 22, margin: '12px 0' }}>このリンクは無効です</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          {loaderData.error === 'TOKEN_EXPIRED' && 'リンクの有効期限が切れています (発行から 90 日経過)'}
          {loaderData.error === 'TOKEN_ALREADY_USED' && 'このリンクは既に使用済みです'}
          {loaderData.error === 'TOKEN_NOT_FOUND' && '無効なリンクです'}
          {loaderData.error === 'INVALID_TOKEN_FORMAT' && 'リンク形式が不正です'}
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: 20,
            padding: '12px 24px',
            background: '#06060C',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          ホームに戻る
        </a>
      </div>
    );
  }

  const { token, customer_name, products, token_type } = loaderData;
  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>レビューを投稿する</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6 }}>
          {customer_name} 様、お買い上げありがとうございました
        </p>
      </div>

      <form method="post" encType="multipart/form-data">
        <input type="hidden" name="token" value={token} />

        {/* 商品選択 */}
        <fieldset style={{ marginBottom: 16, border: 'none', padding: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            レビュー対象商品 <span style={{ color: '#dc2626' }}>*</span>
          </legend>
          <div style={{ background: '#f3f4f6', padding: 14, borderRadius: 8 }}>
            {products.map((p: any, i: number) => (
              <label
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < products.length - 1 ? '1px solid #e5e7eb' : 'none',
                }}
              >
                <input type="radio" name="product_id" value={p.id} defaultChecked={i === 0} required />
                {p.featuredImage?.url && (
                  <img src={p.featuredImage.url} alt="" style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover' }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <RatingStars />

        <Field label="見出し" name="title" required maxLength={60} placeholder="例: 最高のゲーミング体験でした" />
        <Field label="本文" name="body" required textarea maxLength={1000} placeholder="商品の使い心地、購入の決め手等を自由にお書きください" />

        <fieldset style={{ marginBottom: 16, border: 'none', padding: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            写真 <span style={{ fontSize: 11, color: '#9ca3af' }}>(最大 6 枚・各 5MB まで)</span>
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <PhotoSlot key={i} index={i} />
            ))}
          </div>
        </fieldset>

        <Field label="表示名 (本名でなくて可)" name="reviewer_name" required defaultValue={customer_name} />

        <label style={{ display: 'block', fontSize: 12, marginBottom: 16 }}>
          <input type="checkbox" required /> 投稿規約に同意します
        </label>

        <button
          type="submit"
          style={{
            width: '100%',
            padding: 14,
            background: '#06060C',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          投稿する
        </button>
        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>
          投稿後、運営の承認を経て公開されます (通常 1〜2 営業日)
        </p>
      </form>
    </div>
  );
}

function Field(props: any) {
  const Tag: any = props.textarea ? 'textarea' : 'input';
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        {props.label}{' '}
        {props.required && <span style={{ color: '#dc2626' }}>*</span>}{' '}
        {props.maxLength && <span style={{ fontSize: 11, color: '#9ca3af' }}>({props.maxLength} 字以内)</span>}
      </label>
      <Tag
        name={props.name}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        required={props.required}
        maxLength={props.maxLength}
        rows={props.textarea ? 5 : undefined}
        style={{
          width: '100%',
          padding: 10,
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 13,
          marginTop: 6,
          fontFamily: 'inherit',
          resize: props.textarea ? 'vertical' : undefined,
        }}
      />
    </div>
  );
}

function RatingStars() {
  return (
    <fieldset style={{ marginBottom: 16, border: 'none', padding: 0 }}>
      <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        評価 <span style={{ color: '#dc2626' }}>*</span>
      </legend>
      <div style={{ fontSize: 32, color: '#d1d5db', padding: '8px 0' }}>
        {[1, 2, 3, 4, 5].map((v) => (
          <label key={v} style={{ cursor: 'pointer', display: 'inline-block', marginRight: 4 }}>
            <input type="radio" name="rating" value={v} required style={{ display: 'none' }} />☆
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>星をクリックして評価してください</div>
    </fieldset>
  );
}

function PhotoSlot({ index }: { index: number }) {
  return (
    <label
      style={{
        aspectRatio: '1 / 1',
        background: '#f3f4f6',
        border: '2px dashed #d1d5db',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 24,
        color: '#9ca3af',
      }}
    >
      <input type="file" name={`photo_${index}`} accept="image/*" style={{ display: 'none' }} />+
    </label>
  );
}
