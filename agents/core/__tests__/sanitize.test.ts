/**
 * XSS Sanitizer Tests — 免疫系の検証（S-02c）
 *
 * 5パターンのXSS攻撃を検証:
 * 1. <script> タグ注入
 * 2. onerror イベントハンドラ
 * 3. SVG/XML ベースの攻撃
 * 4. <iframe> 埋め込み
 * 5. javascript: URL スキーム
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeHtml,
  sanitizeUrl,
  sanitizeJsonValues,
  detectXssAttempt,
} from '../sanitize.js';

describe('XSS Sanitizer (S-02 免疫系)', () => {

  describe('sanitizeText — 全HTMLタグ除去', () => {
    it('通常テキストはそのまま返す', () => {
      expect(sanitizeText('Hello World')).toBe('Hello World');
      expect(sanitizeText('日本語テスト')).toBe('日本語テスト');
    });

    it('HTMLタグを全て除去する', () => {
      expect(sanitizeText('<b>bold</b>')).toBe('bold');
      expect(sanitizeText('<p>paragraph</p>')).toBe('paragraph');
    });

    it('null/undefined/空文字を安全に処理', () => {
      expect(sanitizeText('')).toBe('');
      expect(sanitizeText(null as unknown as string)).toBe('');
      expect(sanitizeText(undefined as unknown as string)).toBe('');
      expect(sanitizeText(123 as unknown as string)).toBe('');
    });
  });

  describe('sanitizeHtml — 危険パターン除去', () => {
    // Pattern 1: <script> タグ
    it('XSS Pattern 1: <script>タグを除去する', () => {
      const input = 'Hello<script>alert("xss")</script>World';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
    });

    // Pattern 2: onerror イベントハンドラ
    it('XSS Pattern 2: onerrorイベントハンドラを除去する', () => {
      const input = '<img src=x onerror=alert(1)>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    // Pattern 3: SVG/XMLベース
    it('XSS Pattern 3: SVGベースの攻撃を除去する', () => {
      const input = '<svg onload=alert(1)><rect/></svg>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onload');
      expect(result).not.toContain('alert');
    });

    // Pattern 4: <iframe> 埋め込み
    it('XSS Pattern 4: <iframe>を除去する', () => {
      const input = '<iframe src="https://evil.com"></iframe>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
    });

    // Pattern 5: javascript: URL
    it('XSS Pattern 5: javascript:URLを除去する', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('許可されたタグは保持する', () => {
      const input = '<b>bold</b> <em>italic</em> <p>paragraph</p>';
      const result = sanitizeHtml(input);
      expect(result).toContain('<b>');
      expect(result).toContain('<em>');
      expect(result).toContain('<p>');
    });

    it('CSS expression攻撃を除去する', () => {
      const input = '<div style="background:expression(alert(1))">test</div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('expression');
    });
  });

  describe('sanitizeUrl — URL安全性検証', () => {
    it('通常URLはそのまま返す', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
      expect(sanitizeUrl('/relative/path')).toBe('/relative/path');
    });

    it('javascript:URLを空文字にする', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
    });

    it('data:text/html URLを空文字にする', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('vbscript:URLを空文字にする', () => {
      expect(sanitizeUrl('vbscript:MsgBox("xss")')).toBe('');
    });
  });

  describe('sanitizeJsonValues — JSON再帰サニタイズ', () => {
    it('ネストされたオブジェクトの文字列をサニタイズ', () => {
      const input = {
        name: '<script>alert(1)</script>Test',
        nested: {
          value: '<b>bold</b>',
        },
        array: ['<img onerror=alert(1)>', 'safe'],
      };
      const result = sanitizeJsonValues(input) as Record<string, unknown>;
      expect(result.name).not.toContain('<script');
      expect((result.nested as Record<string, string>).value).toBe('bold');
    });

    it('数値・boolean はそのまま返す', () => {
      expect(sanitizeJsonValues(42)).toBe(42);
      expect(sanitizeJsonValues(true)).toBe(true);
      expect(sanitizeJsonValues(null)).toBe(null);
    });
  });

  describe('detectXssAttempt — WAF検出', () => {
    it('危険なパターンを検出する', () => {
      expect(detectXssAttempt('<script>alert(1)</script>')).toBe(true);
      expect(detectXssAttempt('onerror=alert(1)')).toBe(true);
      expect(detectXssAttempt('javascript:void(0)')).toBe(true);
    });

    it('安全な文字列はfalseを返す', () => {
      expect(detectXssAttempt('Hello World')).toBe(false);
      expect(detectXssAttempt('日本語テスト')).toBe(false);
      expect(detectXssAttempt('')).toBe(false);
    });
  });
});
