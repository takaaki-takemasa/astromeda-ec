/**
 * AdminPageEditor 共有プリミティブ — patch 0047 Phase C 第1段
 *
 * 4801行モンスター AdminPageEditor.tsx の第1分割：
 * 「全 Section が共通で使う」型/スタイル/ヘルパー/UI を切り出して
 * 1ファイル肥大化を物理的にほどく入り口にする。
 *
 * ここに置くもの:
 *   - 共有型 (Toast / SubTab / SectionProps / Metaobject 行型 / SectionDef 等)
 *   - 共有スタイルトークン (cardStyle / inputStyle / btn / thStyle / tdStyle / labelStyle)
 *   - API ヘルパー (apiGet / apiPost / cmsCreate / cmsUpdate / cmsDelete)
 *   - Shopify コレクション画像 fallback (fetchCollectionImagesMap / synthesizeCollections)
 *   - フック (useToasts / useConfirmDialog)
 *   - 共有 UI コンポーネント (Spinner / ToastContainer / ConfirmDialog / Modal)
 *
 * ここに置かないもの:
 *   - 個別 Section コンポーネント (Color/Category/.../Ugc 等) — 別ファイルへ
 *   - メイン AdminPageEditor 本体
 *
 * 依存方向: shared.tsx は何も section に依存しない。Section 側が shared.tsx を import する。
 */

import React, {useCallback, useRef, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
// patch 0057 Phase C 第3段: 自前軽量 useConfirmDialog + ConfirmDialog を廃止し
// 正本 (~/hooks/useConfirmDialog + ~/components/admin/ds/ConfirmDialog) に一本化する
import {useConfirmDialog as useCanonicalConfirmDialog} from '~/hooks/useConfirmDialog';
import {ConfirmDialog as DsConfirmDialog} from '~/components/admin/ds/ConfirmDialog';

// ══════════════════════════════════════════════════════════
// 型定義
// ══════════════════════════════════════════════════════════

export interface ColorModel {
  id: string;
  handle: string;
  name: string;
  slug: string;
  image: string | null;
  colorCode: string;
  sortOrder: number;
  isActive: boolean;
}
export interface CategoryCard {
  id: string;
  handle: string;
  title: string;
  description: string;
  priceFrom: number;
  image: string | null;
  linkUrl: string;
  sortOrder: number;
  isActive: boolean;
}
export interface ProductShelf {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  productIds: string[];
  limit: number;
  sortKey: 'manual' | 'best_selling' | 'newest';
  sortOrder: number;
  isActive: boolean;
}
export interface AboutSection {
  id: string;
  handle: string;
  title: string;
  bodyHtml: string;
  image: string | null;
  linkUrl: string;
  linkLabel: string;
  isActive: boolean;
}
export interface FooterConfig {
  id: string;
  handle: string;
  sectionTitle: string;
  links: Array<{label: string; url: string}>;
  sortOrder: number;
  isActive: boolean;
}
export interface IpBanner {
  id: string;
  handle: string;
  name: string;
  shopHandle: string;
  image: string | null;
  tagline: string | null;
  label: string | null;
  sortOrder: number;
  featured: boolean;
}
export interface HeroBanner {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
  sortOrder: number;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
}

export type SubTab =
  | 'visual'
  | 'color_models'
  | 'category_cards'
  | 'product_shelves'
  | 'about_sections'
  | 'footer_configs'
  | 'ip_banners'
  | 'hero_banners'
  | 'customization_matrix'
  | 'gaming_feature_cards'
  | 'gaming_parts_cards'
  | 'gaming_price_ranges'
  | 'gaming_hero'
  | 'gaming_contact'
  | 'ugc_reviews';

export type Toast = {id: number; message: string; type: 'success' | 'error'};

export interface SectionProps {
  pushToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (message: string) => Promise<boolean>;
}

// ══════════════════════════════════════════════════════════
// 共通スタイル
// ══════════════════════════════════════════════════════════

export const cardStyle: React.CSSProperties = {
  background: T.bgC,
  border: `1px solid ${al(T.tx, 0.08)}`,
  borderRadius: 10,
  padding: 20,
};
export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: T.t4,
  letterSpacing: 1,
  marginBottom: 6,
  display: 'block',
};
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: T.bg,
  border: `1px solid ${al(T.tx, 0.15)}`,
  borderRadius: 6,
  color: T.tx,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
export const btn = (primary = false, danger = false): React.CSSProperties => ({
  padding: '6px 14px',
  background: primary ? T.c : danger ? 'transparent' : 'transparent',
  border: `1px solid ${primary ? T.c : danger ? al(T.r, 0.5) : al(T.tx, 0.25)}`,
  borderRadius: 6,
  color: primary ? T.bg : danger ? T.r : T.tx,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
export const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  color: T.t4,
  fontSize: 11,
  fontWeight: 700,
  borderBottom: `1px solid ${al(T.tx, 0.1)}`,
};
export const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  color: T.tx,
  fontSize: 12,
  borderBottom: `1px solid ${al(T.tx, 0.05)}`,
};

// ══════════════════════════════════════════════════════════
// 共通フック
// ══════════════════════════════════════════════════════════

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, {id, message, type}]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  return {toasts, push};
}

// patch 0057 Phase C 第3段: 正本 ~/hooks/useConfirmDialog へ一本化したアダプタ。
// SectionProps は `confirm: (message: string) => Promise<boolean>` を契約しているため、
// 既存 Section コードは一切書き換えず、この wrapper が Stripe 水準 ConfirmDialog に中継する。
//
// 新規コードは `~/hooks/useConfirmDialog` を直接使い、`confirm({title, message, destructive})`
// の options オブジェクト API を優先すること（destructive=true で赤ボタン化するなど表現力が高い）。
export function useConfirmDialog() {
  const {confirm: canonicalConfirm, dialogProps} = useCanonicalConfirmDialog();

  const confirm = useCallback(
    (message: string): Promise<boolean> => {
      // 1行目→title, 残り→body という単純マップ。
      const [firstLine, ...rest] = message.split('\n');
      const body = rest.join('\n').trim();
      const destructive = /削除|破棄|デリート|delete|remove|discard/i.test(message);
      return canonicalConfirm({
        title: firstLine || '確認',
        message: body || undefined,
        destructive,
        confirmLabel: destructive ? '削除' : 'OK',
      });
    },
    [canonicalConfirm],
  );

  // 旧 API {state, handleOk, handleCancel} は <ConfirmDialog {...dialogProps} /> 方式に移行済。
  // AdminPageEditor.tsx は dialogProps spread で描画する。
  return {confirm, dialogProps};
}

// ══════════════════════════════════════════════════════════
// 共通 UI コンポーネント
// ══════════════════════════════════════════════════════════

// patch 0057 Phase C 第3段: 自前 ConfirmDialog を廃止し Stripe 水準の canonical 実装を再エクスポート。
// 旧 API `<ConfirmDialog open message onOk onCancel />` は破棄。呼び出し側は
// `<ConfirmDialog {...dialogProps} />` で `~/components/admin/ds/ConfirmDialog` に統一される。
export const ConfirmDialog = DsConfirmDialog;

export function Spinner() {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: `2px solid ${al(T.c, 0.3)}`,
        borderTopColor: T.c,
        borderRadius: '50%',
        animation: 'aped-spin 0.8s linear infinite',
      }}
    />
  );
}

export function ToastContainer({toasts}: {toasts: Toast[]}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '10px 16px',
            background: t.type === 'success' ? al(T.c, 0.95) : al(T.r, 0.95),
            color: T.bg,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(0,0,0,.4)',
            minWidth: 220,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  preview,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  const isTwoPane = !!preview;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: T.bg,
          border: `1px solid ${al(T.tx, 0.15)}`,
          borderRadius: 12,
          width: '100%',
          maxWidth: isTwoPane ? 1400 : 600,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 32px rgba(0,0,0,.6)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${al(T.tx, 0.1)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{fontSize: 14, fontWeight: 900, color: T.tx}}>{title}</div>
          <button type="button" onClick={onClose} style={{...btn(), padding: '4px 10px'}}>
            ×
          </button>
        </div>
        {isTwoPane ? (
          <div
            className="admin-modal-2pane"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(360px, 1fr) minmax(380px, 1.3fr)',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: 20,
                overflow: 'auto',
                borderRight: `1px solid ${al(T.tx, 0.08)}`,
              }}
            >
              {children}
            </div>
            <div style={{padding: 16, background: al(T.tx, 0.02), overflow: 'auto'}}>
              {preview}
            </div>
          </div>
        ) : (
          <div style={{padding: 20, overflow: 'auto'}}>{children}</div>
        )}
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 1100px) {
          .admin-modal-2pane {
            grid-template-columns: 1fr !important;
          }
        }
      `,
        }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// API ヘルパー
// ══════════════════════════════════════════════════════════

export async function apiPost(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{success: boolean; error?: string; [k: string]: unknown}> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json as {success: boolean; error?: string};
  } catch (err) {
    return {success: false, error: err instanceof Error ? err.message : 'Network error'};
  }
}

export async function apiGet<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(endpoint, {credentials: 'include'});
    if (!res.ok) return null;
    const json = (await res.json()) as {success?: boolean} & T;
    if (json.success === false) return null;
    return json as T;
  } catch {
    return null;
  }
}

// CMS ショートハンド
export async function cmsCreate(
  type: string,
  handle: string,
  fields: Array<{key: string; value: string}>,
) {
  return apiPost('/api/admin/cms', {type, action: 'create', handle, fields});
}

export async function cmsUpdate(
  type: string,
  id: string,
  fields: Array<{key: string; value: string}>,
) {
  return apiPost('/api/admin/cms', {type, action: 'update', id, fields});
}

export async function cmsDelete(type: string, id: string) {
  return apiPost('/api/admin/cms', {type, action: 'delete', id});
}

// ══════════════════════════════════════════════════════════
// Shopify コレクション画像 fallback (preview 用)
// patch 0006 由来
// ══════════════════════════════════════════════════════════

export type SynthCollection = {
  id: string;
  title: string;
  handle: string;
  image: {url: string; altText: string} | null;
};

export async function fetchCollectionImagesMap(
  handles: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(handles.filter(Boolean)));
  if (unique.length === 0) return {};
  try {
    const res = await fetch('/api/admin/collection-images', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({handles: unique}),
    });
    if (!res.ok) return {};
    const json = await res.json();
    return (json?.images ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

export function synthesizeCollections(imageMap: Record<string, string>): SynthCollection[] {
  return Object.entries(imageMap).map(([handle, url]) => ({
    id: `gid://shopify/Collection/synth-${handle}`,
    title: handle,
    handle,
    image: url ? {url, altText: ''} : null,
  }));
}
