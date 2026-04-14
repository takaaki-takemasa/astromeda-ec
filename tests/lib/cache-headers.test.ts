/**
 * Cache Headers Test Suite
 *
 * Tests cache header generation and optimization utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  CACHE_PROFILES,
  applyCacheHeaders,
  cacheHeaders,
  optimizeImageUrl,
  generateSrcSet,
  preloadImage,
  type CacheProfileName,
} from '~/lib/cache-headers';

describe('Cache Headers', () => {
  describe('CACHE_PROFILES', () => {
    it('should define all profile names', () => {
      expect(CACHE_PROFILES.page).toBeDefined();
      expect(CACHE_PROFILES.product).toBeDefined();
      expect(CACHE_PROFILES.static).toBeDefined();
      expect(CACHE_PROFILES.noCache).toBeDefined();
      expect(CACHE_PROFILES.admin).toBeDefined();
      expect(CACHE_PROFILES.webhook).toBeDefined();
    });

    it('should have cacheControl for each profile', () => {
      for (const [name, profile] of Object.entries(CACHE_PROFILES)) {
        expect(profile.cacheControl).toBeDefined();
        expect(typeof profile.cacheControl).toBe('string');
        expect(profile.cacheControl.length).toBeGreaterThan(0);
      }
    });

    it('page profile should have public caching', () => {
      expect(CACHE_PROFILES.page.cacheControl).toContain('public');
    });

    it('product profile should have stale-while-revalidate', () => {
      expect(CACHE_PROFILES.product.cacheControl).toContain('stale-while-revalidate');
    });

    it('static profile should have long CDN cache', () => {
      expect(CACHE_PROFILES.static.cacheControl).toContain('s-maxage=86400');
    });

    it('noCache profile should disable caching', () => {
      expect(CACHE_PROFILES.noCache.cacheControl).toContain('no-store');
      expect(CACHE_PROFILES.noCache.cacheControl).toContain('no-cache');
    });

    it('admin profile should be private', () => {
      expect(CACHE_PROFILES.admin.cacheControl).toContain('private');
      expect(CACHE_PROFILES.admin.cacheControl).toContain('no-store');
    });

    it('webhook profile should not cache', () => {
      expect(CACHE_PROFILES.webhook.cacheControl).toContain('no-store');
    });

    it('should have Vary header for most profiles', () => {
      expect(CACHE_PROFILES.page.vary).toBe('Accept-Encoding');
      expect(CACHE_PROFILES.product.vary).toBe('Accept-Encoding');
      expect(CACHE_PROFILES.static.vary).toBe('Accept-Encoding');
    });
  });

  describe('applyCacheHeaders', () => {
    it('should set Cache-Control header from profile name', () => {
      const headers = new Headers();
      applyCacheHeaders(headers, 'page');

      expect(headers.get('Cache-Control')).toBe(CACHE_PROFILES.page.cacheControl);
    });

    it('should set Cache-Control header from profile object', () => {
      const headers = new Headers();
      const profile = { cacheControl: 'max-age=3600' };

      applyCacheHeaders(headers, profile);

      expect(headers.get('Cache-Control')).toBe('max-age=3600');
    });

    it('should set Vary header when defined in profile', () => {
      const headers = new Headers();
      applyCacheHeaders(headers, 'page');

      expect(headers.get('Vary')).toBe('Accept-Encoding');
    });

    it('should not set Vary header when not defined in profile', () => {
      const headers = new Headers();
      const profile = { cacheControl: 'max-age=3600' };

      applyCacheHeaders(headers, profile);

      expect(headers.get('Vary')).toBeNull();
    });

    it('should return the headers object', () => {
      const headers = new Headers();
      const result = applyCacheHeaders(headers, 'page');

      expect(result).toBe(headers);
    });

    it('should override existing headers', () => {
      const headers = new Headers();
      headers.set('Cache-Control', 'old-value');

      applyCacheHeaders(headers, 'page');

      expect(headers.get('Cache-Control')).toBe(CACHE_PROFILES.page.cacheControl);
    });

    it('should work with all profile names', () => {
      const profileNames: CacheProfileName[] = [
        'page',
        'product',
        'static',
        'noCache',
        'admin',
        'webhook',
      ];

      for (const name of profileNames) {
        const headers = new Headers();
        expect(() => applyCacheHeaders(headers, name)).not.toThrow();
        expect(headers.get('Cache-Control')).toBeTruthy();
      }
    });
  });

  describe('cacheHeaders', () => {
    it('should return a function', () => {
      const result = cacheHeaders('page');
      expect(typeof result).toBe('function');
    });

    it('should return headers object when function is called', () => {
      const headersFn = cacheHeaders('page');
      const headers = headersFn();

      expect(headers).toBeDefined();
      expect(typeof headers).toBe('object');
    });

    it('should include Cache-Control header', () => {
      const headersFn = cacheHeaders('page');
      const headers = headersFn();

      expect(headers['Cache-Control']).toBeDefined();
      expect(headers['Cache-Control']).toBe(CACHE_PROFILES.page.cacheControl);
    });

    it('should include Vary header when defined in profile', () => {
      const headersFn = cacheHeaders('page');
      const headers = headersFn();

      expect(headers['Vary']).toBe('Accept-Encoding');
    });

    it('should not include Vary header when not defined', () => {
      const headersFn = cacheHeaders('noCache');
      const headers = headersFn();

      expect(headers['Vary']).toBeUndefined();
    });

    it('should work with React Router HeadersFunction pattern', () => {
      const headersFn = cacheHeaders('product');
      const headers = headersFn();

      expect(Object.keys(headers)).toContain('Cache-Control');
    });
  });

  describe('optimizeImageUrl', () => {
    it('should return empty string for empty URL', () => {
      const result = optimizeImageUrl('', 600);
      expect(result).toBe('');
    });

    it('should add width parameter', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = optimizeImageUrl(url, 600);

      expect(result).toContain('width=600');
    });

    it('should add format=webp parameter', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = optimizeImageUrl(url, 600);

      expect(result).toContain('format=webp');
    });

    it('should add quality parameter with default value', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = optimizeImageUrl(url, 600);

      expect(result).toContain('quality=75');
    });

    it('should accept custom quality parameter', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = optimizeImageUrl(url, 600, 90);

      expect(result).toContain('quality=90');
    });

    it('should use ? separator when no query string exists', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = optimizeImageUrl(url, 600);

      expect(result).toContain('?width=600');
    });

    it('should use & separator when query string exists', () => {
      const url = 'https://cdn.example.com/image.jpg?v=1';
      const result = optimizeImageUrl(url, 600);

      expect(result).toContain('&width=600');
    });

    it('should preserve existing query parameters', () => {
      const url = 'https://cdn.example.com/image.jpg?v=1&crop=center';
      const result = optimizeImageUrl(url, 600);

      expect(result).toContain('v=1');
      expect(result).toContain('crop=center');
      expect(result).toContain('width=600');
    });
  });

  describe('generateSrcSet', () => {
    it('should generate multiple sizes', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = generateSrcSet(url);

      expect(result).toContain('320w');
      expect(result).toContain('640w');
      expect(result).toContain('960w');
      expect(result).toContain('1280w');
      expect(result).toContain('1920w');
    });

    it('should use default widths when not specified', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = generateSrcSet(url);

      const entries = result.split(',').map(s => s.trim());
      expect(entries.length).toBe(5);
    });

    it('should accept custom widths', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const widths = [300, 600, 900];
      const result = generateSrcSet(url, widths);

      expect(result).toContain('300w');
      expect(result).toContain('600w');
      expect(result).toContain('900w');
    });

    it('should include webp format parameter', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = generateSrcSet(url);

      expect(result).toContain('format=webp');
    });

    it('should format as valid srcset syntax', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = generateSrcSet(url);

      const entries = result.split(',').map(s => s.trim());
      entries.forEach(entry => {
        expect(entry).toMatch(/^.+ \d+w$/);
      });
    });

    it('should handle single width', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = generateSrcSet(url, [800]);

      expect(result).toContain('800w');
      expect(result.split(',').length).toBe(1);
    });
  });

  describe('preloadImage', () => {
    it('should return preload link object', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = preloadImage(url, 600);

      expect(result).toBeDefined();
      expect(result.tagName).toBe('link');
      expect(result.rel).toBe('preload');
      expect(result.as).toBe('image');
    });

    it('should include optimized image URL', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = preloadImage(url, 600);

      expect(result.href).toContain('width=600');
      expect(result.href).toContain('format=webp');
    });

    it('should set fetchpriority to high', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = preloadImage(url, 600);

      expect(result.fetchpriority).toBe('high');
    });

    it('should generate valid preload object structure', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = preloadImage(url, 800);

      expect(Object.keys(result)).toContain('tagName');
      expect(Object.keys(result)).toContain('rel');
      expect(Object.keys(result)).toContain('as');
      expect(Object.keys(result)).toContain('href');
      expect(Object.keys(result)).toContain('fetchpriority');
    });

    it('should work with different widths', () => {
      const url = 'https://cdn.example.com/image.jpg';

      for (const width of [320, 600, 1200]) {
        const result = preloadImage(url, width);
        expect(result.href).toContain(`width=${width}`);
      }
    });
  });

  describe('integration', () => {
    it('should work together: optimize + srcset + preload', () => {
      const baseUrl = 'https://cdn.example.com/hero.jpg';

      const optimized = optimizeImageUrl(baseUrl, 1200);
      expect(optimized).toContain('width=1200');

      const srcset = generateSrcSet(baseUrl);
      expect(srcset.split(',').length).toBe(5);

      const preload = preloadImage(baseUrl, 1200);
      expect(preload.href).toContain('width=1200');
    });

    it('should work with Shopify CDN URLs', () => {
      const shopifyUrl = 'https://cdn.shopify.com/s/files/1/0000/0001/products/image.jpg?v=1';

      const optimized = optimizeImageUrl(shopifyUrl, 600);
      expect(optimized).toContain('width=600');
      expect(optimized).toContain('format=webp');

      const srcset = generateSrcSet(shopifyUrl);
      expect(srcset).toBeTruthy();
    });
  });
});
