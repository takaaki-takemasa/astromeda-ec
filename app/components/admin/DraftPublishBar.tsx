import { color } from '~/lib/design-tokens';

export type PublishStatus = 'DRAFT' | 'ACTIVE';

interface PublishableItem {
  publishStatus?: 'DRAFT' | 'ACTIVE' | string;
  isDraft?: boolean | string;
  is_draft?: boolean | string;
  is_active?: boolean | string;
  [key: string]: unknown;
}

export function getPublishStatus(item: PublishableItem): PublishStatus {
  if (item.publishStatus === 'DRAFT' || item.publishStatus === 'ACTIVE') {
    return item.publishStatus;
  }
  const draftFlag = item.isDraft ?? item.is_draft;
  if (draftFlag === true || draftFlag === 'true') return 'DRAFT';
  const active = item.is_active;
  if (active === false || active === 'false') return 'DRAFT';
  return 'ACTIVE';
}

const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: 3,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

export function DraftBadge({ status }: { status: PublishStatus }) {
  if (status === 'ACTIVE') {
    return (
      <span style={{ ...badgeBase, background: 'rgba(107,255,123,.15)', color: '#6bff7b', border: '1px solid rgba(107,255,123,.4)' }}>
        公開中
      </span>
    );
  }
  return (
    <span style={{ ...badgeBase, background: 'rgba(255,176,32,.15)', color: '#ffb020', border: '1px solid rgba(255,176,32,.4)' }}>
      下書き
    </span>
  );
}

export type PublishFilter = 'all' | 'active' | 'draft';

interface PublishStatusFilterProps {
  value: PublishFilter;
  onChange: (v: PublishFilter) => void;
  counts: { all: number; active: number; draft: number };
}

export function PublishStatusFilter({ value, onChange, counts }: PublishStatusFilterProps) {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? color.text : color.textMuted,
    background: active ? color.bg1 : 'transparent',
    border: `1px solid ${active ? color.border : 'transparent'}`,
    borderRadius: 6,
    cursor: 'pointer',
  });
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button type="button" style={tabStyle(value === 'all')} onClick={() => onChange('all')}>
        すべて ({counts.all})
      </button>
      <button type="button" style={tabStyle(value === 'active')} onClick={() => onChange('active')}>
        公開中 ({counts.active})
      </button>
      <button type="button" style={tabStyle(value === 'draft')} onClick={() => onChange('draft')}>
        下書き ({counts.draft})
      </button>
    </div>
  );
}

interface PublishButtonsProps {
  onCancel: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  saving?: boolean;
  isNew?: boolean;
  currentStatus?: PublishStatus;
}

export function PublishButtons({ onCancel, onSaveDraft, onPublish, saving, isNew, currentStatus }: PublishButtonsProps) {
  const btnBase: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    cursor: saving ? 'wait' : 'pointer',
    opacity: saving ? 0.6 : 1,
  };
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        style={{ ...btnBase, color: color.textMuted, background: 'transparent', border: `1px solid ${color.border}` }}
      >
        キャンセル
      </button>
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={saving}
        style={{ ...btnBase, color: '#ffb020', background: 'rgba(255,176,32,.12)', border: '1px solid rgba(255,176,32,.4)' }}
      >
        {saving ? '保存中…' : '下書き保存'}
      </button>
      <button
        type="button"
        onClick={onPublish}
        disabled={saving}
        style={{ ...btnBase, color: '#000', background: color.cyan, border: 'none', fontWeight: 700 }}
      >
        {saving ? '公開中…' : isNew || currentStatus === 'DRAFT' ? '公開する' : '更新して公開'}
      </button>
    </div>
  );
}
