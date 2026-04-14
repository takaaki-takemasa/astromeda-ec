/**
 * AI Referrer Tracker — AI検索エンジンからのアクセス検出・追跡
 *
 * ChatGPT、Claude、Gemini、Perplexityなどの生成AI検索エンジンから
 * ユーザーが当サイトに到達した場合を検出し、GA4に記録。
 *
 * 「AI引用」による新規チャネルの売上分析が可能になり、
 * 将来的なAI SEO戦略の投資判断に活用できる。
 *
 * SSR対応: 全関数は typeof window === 'undefined' をチェック。
 * SessionStorage: セッション中の重複イベント送信を防止。
 */

import {trackCustomEvent} from './ga4-events';

/** AI referralの型定義 */
export interface AIReferral {
  source: string;
  timestamp: number;
  landingPage: string;
  rawReferrer: string;
}

/** AI検索エンジンのパターン定義 */
interface AISourcePattern {
  name: string;
  patterns: RegExp[];
  displayName: string;
}

/** 全AI検索エンジン検出パターン */
const AI_SOURCES: AISourcePattern[] = [
  {
    name: 'chatgpt',
    patterns: [/chat\.openai\.com/i, /chatgpt\.com/i],
    displayName: 'ChatGPT',
  },
  {
    name: 'claude',
    patterns: [/claude\.ai/i],
    displayName: 'Claude',
  },
  {
    name: 'gemini',
    patterns: [/gemini\.google\.com/i, /bard\.google\.com/i],
    displayName: 'Gemini',
  },
  {
    name: 'perplexity',
    patterns: [/perplexity\.ai/i],
    displayName: 'Perplexity',
  },
  {
    name: 'grok',
    patterns: [/x\.com\/i\/grok/i, /grok\.x\.ai/i, /grok\.com/i],
    displayName: 'Grok',
  },
  {
    name: 'copilot',
    patterns: [/copilot\.microsoft\.com/i],
    displayName: 'Copilot',
  },
  {
    name: 'you',
    patterns: [/you\.com/i],
    displayName: 'You.com',
  },
  {
    name: 'phind',
    patterns: [/phind\.com/i],
    displayName: 'Phind',
  },
  {
    name: 'searchgpt',
    patterns: [/search\.openai\.com/i],
    displayName: 'SearchGPT',
  },
];

/** SessionStorageキー */
const AI_REFERRAL_KEY = 'astromeda_ai_referral_tracked';

/**
 * AI referralを検出（referrer/document.referrer から）
 */
export function detectAIReferral(): AIReferral | null {
  if (typeof window === 'undefined') return null;

  const referrer = document.referrer;
  if (!referrer) return null;

  // AI sourceパターンマッチング
  for (const source of AI_SOURCES) {
    for (const pattern of source.patterns) {
      if (pattern.test(referrer)) {
        return {
          source: source.name,
          timestamp: Date.now(),
          landingPage: window.location.pathname + window.location.search,
          rawReferrer: referrer,
        };
      }
    }
  }

  return null;
}

/**
 * AIアクセスをGA4に送信（セッション内で1回のみ）
 */
export function trackAIReferral(referral: AIReferral): void {
  if (typeof window === 'undefined') return;

  // セッション中に既に記録済みならスキップ
  const already = sessionStorage.getItem(AI_REFERRAL_KEY);
  if (already) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[AI Referrer] Already tracked in this session');
    }
    return;
  }

  // GA4カスタムイベントで送信
  trackCustomEvent('ai_citation', {
    ai_source: referral.source,
    landing_page: referral.landingPage,
    timestamp: referral.timestamp,
  });

  // セッション記録
  sessionStorage.setItem(AI_REFERRAL_KEY, '1');

  if (process.env.NODE_ENV === 'development') {
    console.debug('[AI Referrer] Tracked:', referral.source, referral.landingPage);
  }
}

/**
 * ページロード時に自動実行するための関数（ルートレイアウトで呼び出し）
 * detectとtrackを一度に行う
 */
export function trackAIReferralIfExists(): AIReferral | null {
  if (typeof window === 'undefined') return null;

  const referral = detectAIReferral();
  if (referral) {
    trackAIReferral(referral);
  }
  return referral;
}

/**
 * AI referral情報を取得（デバッグ用）
 */
export function getAIReferralInfo(): AIReferral | null {
  if (typeof window === 'undefined') return null;
  return detectAIReferral();
}

/**
 * セッションのAI referral記録をリセット（テスト用）
 */
export function resetAIReferralTracking(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AI_REFERRAL_KEY);
}

/**
 * AI Sourceの表示名を取得
 */
export function getAISourceDisplayName(source: string): string {
  const sourcePattern = AI_SOURCES.find((s) => s.name === source);
  return sourcePattern?.displayName || source;
}

/**
 * 既にこのセッションでAI referralが記録済みかチェック
 */
export function isAIReferralAlreadyTracked(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(AI_REFERRAL_KEY) === '1';
}
