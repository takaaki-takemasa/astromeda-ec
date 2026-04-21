/**
 * ============================================================
 * ProductCustomization.mergeCustomizationOptions — 遺伝子組換え手術の検証
 *
 * patch 0095 で導入した exclusive-OR マージ関数の健全性を測る。
 * CPU/GPU/メモリ/SSD 等の 17 項目 (STANDARD_OPTIONS) が、
 * 管理画面 Metaobject で 1 件でも customOption を作ると全消失する
 * 旧 full-replace バグへの再発防止ガード。
 * ============================================================
 */
import {describe, it, expect} from 'vitest';
import {
  mergeCustomizationOptions,
  type CustomizationOption,
} from './ProductCustomization';

// 最小の CustomizationOption を作るヘルパー
// CustomizationOption は { name, options: {value,label}[], dependsOn? } 形式。
// tag は「どの版か」(標準 vs 管理画面版) を label に埋めて追跡可能にする。
function opt(name: string, tag = ''): CustomizationOption {
  return {
    name,
    options: [
      {value: 'std', label: tag ? `標準 (${tag})` : '標準'},
    ],
  };
}

describe('mergeCustomizationOptions', () => {
  it('overrides が undefined のとき base をそのまま返す', () => {
    const base = [opt('CPU'), opt('GPU'), opt('メモリ')];
    expect(mergeCustomizationOptions(base, undefined)).toEqual(base);
  });

  it('overrides が空配列のとき base をそのまま返す（admin 未設定は STANDARD_OPTIONS 維持）', () => {
    const base = [opt('CPU'), opt('GPU'), opt('メモリ')];
    const result = mergeCustomizationOptions(base, []);
    expect(result).toHaveLength(3);
    expect(result.map((o) => o.name)).toEqual(['CPU', 'GPU', 'メモリ']);
  });

  it('name 衝突時は admin 側が base を置換する', () => {
    const base = [opt('CPU', '標準'), opt('GPU', '標準'), opt('メモリ', '標準')];
    const overrides = [opt('CPU', '管理画面版')];
    const result = mergeCustomizationOptions(base, overrides);
    expect(result).toHaveLength(3);
    const cpu = result.find((o) => o.name === 'CPU');
    // label 経由で「管理画面版」が勝ったことを確認
    expect(cpu?.options[0].label).toContain('管理画面版');
  });

  it('new name は末尾に追加される（admin で新カテゴリ追加）', () => {
    const base = [opt('CPU'), opt('GPU')];
    const overrides = [opt('GPUクーラー'), opt('ケースファン')];
    const result = mergeCustomizationOptions(base, overrides);
    expect(result).toHaveLength(4);
    expect(result.map((o) => o.name)).toEqual([
      'CPU',
      'GPU',
      'GPUクーラー',
      'ケースファン',
    ]);
  });

  it('置換＋追加の混在: CPU 上書き + 新 GPUクーラー 追加', () => {
    const base = [opt('CPU', '標準'), opt('GPU'), opt('メモリ')];
    const overrides = [opt('CPU', '管理版'), opt('GPUクーラー')];
    const result = mergeCustomizationOptions(base, overrides);
    // 置換されない base (GPU/メモリ) が先、overrides (CPU管理版/GPUクーラー) が後
    expect(result.map((o) => o.name)).toEqual([
      'GPU',
      'メモリ',
      'CPU',
      'GPUクーラー',
    ]);
    expect(
      result.find((o) => o.name === 'CPU')?.options[0].label,
    ).toContain('管理版');
  });

  it('17 項目 STANDARD_OPTIONS 大のケースで 1 件 admin 追加しても base が保全される（再発防止）', () => {
    const base: CustomizationOption[] = Array.from({length: 17}, (_, i) =>
      opt(`項目${i}`),
    );
    const overrides = [opt('新カテゴリ')];
    const result = mergeCustomizationOptions(base, overrides);
    // 旧 full-replace バグなら result.length === 1 になる
    expect(result).toHaveLength(18);
    expect(result[17].name).toBe('新カテゴリ');
    // 17 項目が全員生存
    for (let i = 0; i < 17; i++) {
      expect(result.some((o) => o.name === `項目${i}`)).toBe(true);
    }
  });

  it('base を mutate しない（純関数性の担保）', () => {
    const base = [opt('CPU'), opt('GPU')];
    const baseSnapshot = [...base];
    mergeCustomizationOptions(base, [opt('CPU', '新')]);
    expect(base).toEqual(baseSnapshot);
    expect(base).toHaveLength(2);
  });
});
