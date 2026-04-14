import {describe, it, expect} from 'vitest';
import {generateQRCodeSVG, generateRateLimitHeaders} from './qr-code';

describe('QR Code Generation', () => {
  it('should generate a valid SVG for a URL', () => {
    const url = 'https://shop.mining-base.co.jp/';
    const svg = generateQRCodeSVG(url);

    expect(svg).toBeDefined();
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('fill="#FFFFFF"');
  });

  it('should respect custom size parameter', () => {
    const url = 'https://example.com';
    const size = 512;
    const svg = generateQRCodeSVG(url, {size});

    expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
    expect(svg).toContain(`width="${size}"`);
    expect(svg).toContain(`height="${size}"`);
  });

  it('should respect custom colors', () => {
    const url = 'https://example.com';
    const darkColor = '#123456';
    const lightColor = '#ABCDEF';

    const svg = generateQRCodeSVG(url, {
      darkColor,
      lightColor,
    });

    expect(svg).toContain(darkColor);
    expect(svg).toContain(lightColor);
  });

  it('should include margin in SVG dimensions', () => {
    const url = 'https://example.com';
    const size = 256;
    const margin = 6;

    const svg = generateQRCodeSVG(url, {size, margin});
    expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
  });

  it('should throw error for empty URL', () => {
    expect(() => generateQRCodeSVG('')).toThrow('空です');
  });

  it('should throw error for very long URL', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(3000);
    expect(() => generateQRCodeSVG(longUrl)).toThrow('長すぎます');
  });

  it('should generate rate limit headers', () => {
    const headers = generateRateLimitHeaders(1000, 50, 3600);

    expect(headers['X-RateLimit-Limit']).toBe('1000');
    expect(headers['X-RateLimit-Used']).toBe('50');
    expect(headers['X-RateLimit-Remaining']).toBe('950');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('should handle rate limit remaining edge case', () => {
    const headers = generateRateLimitHeaders(100, 150, 3600);
    expect(headers['X-RateLimit-Remaining']).toBe('0'); // Should be max(0, 100 - 150)
  });

  it('should generate valid SVG structure with multiple test URLs', () => {
    const urls = [
      'https://shop.mining-base.co.jp/',
      'https://example.com/page?query=test',
      'https://sub.domain.co.jp/path/to/page#anchor',
    ];

    urls.forEach((url) => {
      const svg = generateQRCodeSVG(url);
      expect(svg).toMatch(/<svg[^>]*>/);
      expect(svg).toMatch(/<\/svg>/);
      expect(svg).toContain('<rect');
    });
  });
});
