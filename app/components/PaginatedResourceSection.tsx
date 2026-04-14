import * as React from 'react';
import {Pagination} from '@shopify/hydrogen';

const paginationBtnStyle: React.CSSProperties = {
  display: 'block',
  margin: '24px auto 0',
  padding: '12px 40px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'transparent',
  cursor: 'pointer',
  color: 'rgba(255,255,255,.5)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textDecoration: 'none',
};

/**
 * <PaginatedResourceSection > is a component that encapsulate how the previous and next behaviors throughout your application.
 */
export function PaginatedResourceSection<NodesType>({
  connection,
  children,
  resourcesClassName,
}: {
  connection: React.ComponentProps<typeof Pagination<NodesType>>['connection'];
  children: React.FunctionComponent<{node: NodesType; index: number}>;
  resourcesClassName?: string;
}) {
  return (
    <Pagination connection={connection}>
      {({nodes, isLoading, PreviousLink, NextLink}) => {
        const resourcesMarkup = nodes.map((node, index) =>
          children({node, index}),
        );

        return (
          <div>
            <PreviousLink style={paginationBtnStyle}>
              {isLoading ? '読み込み中...' : '↑ 前の商品を表示'}
            </PreviousLink>
            {resourcesClassName ? (
              <div className={resourcesClassName}>{resourcesMarkup}</div>
            ) : (
              resourcesMarkup
            )}
            <NextLink style={paginationBtnStyle}>
              {isLoading ? '読み込み中...' : 'さらに表示する ↓'}
            </NextLink>
          </div>
        );
      }}
    </Pagination>
  );
}
