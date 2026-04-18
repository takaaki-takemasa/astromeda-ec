/**
 * cms-url helper tests — patch 0012
 *
 * CMS 由来の linkUrl が旧サイト絶対URL（shop.mining-base.co.jp/...）で入っていた場合に、
 * React Router `<Link to>` で新 Hydrogen サイトから離脱する問題の再発防止。
 */

import { describe, it, expect } from 'vitest';
import { toInternalPath, isExternalHref } from '../cms-url';

describe('toInternalPath', () => {
  it('空/undefined/null は # に落とす', () => {
    expect(toInternalPath(null)).toBe('#');
    expect(toInternalPath(undefined)).toBe('#');
    expect(toInternalPath('')).toBe('#');
    expect(toInternalPath('   ')).toBe('#');
  });

  it('相対パスはそのまま保持', () => {
    expect(toInternalPath('/collections/new-arrivals')).toBe('/collections/new-arrivals');
    expect(toInternalPath('/products/foo')).toBe('/products/foo');
    expect(toInternalPath('/about')).toBe('/about');
    expect(toInternalPath('/')).toBe('/');
  });

  it('相対パスのクエリ/ハッシュも保持', () => {
    expect(toInternalPath('/collections/new-arrivals?sort=newest')).toBe('/collections/new-arrivals?sort=newest');
    expect(toInternalPath('/products/foo#reviews')).toBe('/products/foo#reviews');
  });

  it('旧サイト (shop.mining-base.co.jp) の絶対URLは内部パスに畳む', () => {
    expect(toInternalPath('https://shop.mining-base.co.jp/collections/new-arrivals')).toBe('/collections/new-arrivals');
    expect(toInternalPath('https://shop.mining-base.co.jp/products/bar')).toBe('/products/bar');
    expect(toInternalPath('https://shop.mining-base.co.jp/pages/about')).toBe('/pages/about');
  });

  it('自サイト myshopify.com / myshopify.dev の絶対URLも内部パスに畳む', () => {
    expect(toInternalPath('https://production-mining-base.myshopify.com/collections/foo')).toBe('/collections/foo');
    expect(toInternalPath('https://astromeda-ec-273085cdf98d80a57b73.o2.myshopify.dev/cart')).toBe('/cart');
    expect(toInternalPath('https://01kp4swb70.myshopify.dev/admin')).toBe('/admin');
  });

  it('クエリ/ハッシュ付き絶対URLも畳む', () => {
    expect(toInternalPath('https://shop.mining-base.co.jp/collections/foo?ref=banner')).toBe('/collections/foo?ref=banner');
    expect(toInternalPath('https://shop.mining-base.co.jp/products/bar#spec')).toBe('/products/bar#spec');
  });

  it('外部サイトはそのまま返す', () => {
    expect(toInternalPath('https://www.youtube.com/watch?v=xxx')).toBe('https://www.youtube.com/watch?v=xxx');
    expect(toInternalPath('https://line.me/R/ti/p/xxx')).toBe('https://line.me/R/ti/p/xxx');
  });

  it('危険 scheme は # に置換', () => {
    expect(toInternalPath('javascript:alert(1)')).toBe('#');
    expect(toInternalPath('JavaScript:void(0)')).toBe('#');
    expect(toInternalPath('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(toInternalPath('vbscript:msgbox')).toBe('#');
  });

  it('プロトコル相対URL (//host/path) も host 一致なら内部パスに畳む', () => {
    expect(toInternalPath('//shop.mining-base.co.jp/collections/foo')).toBe('/collections/foo');
  });

  it('ハッシュのみは保持', () => {
    expect(toInternalPath('#section')).toBe('#section');
  });
});

describe('isExternalHref', () => {
  it('http/https で始まるなら外部', () => {
    expect(isExternalHref('https://www.youtube.com')).toBe(true);
    expect(isExternalHref('http://example.com')).toBe(true);
  });

  it('相対パスは外部ではない', () => {
    expect(isExternalHref('/collections/foo')).toBe(false);
    expect(isExternalHref('/')).toBe(false);
  });

  it('# は外部ではない', () => {
    expect(isExternalHref('#')).toBe(false);
    expect(isExternalHref('#section')).toBe(false);
  });

  it('空文字は外部ではない', () => {
    expect(isExternalHref('')).toBe(false);
  });
});
