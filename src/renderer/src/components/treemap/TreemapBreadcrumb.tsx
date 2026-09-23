import type { DirectoryNode } from '@shared/ipc';

type TreemapBreadcrumbProps = {
  trail: DirectoryNode[];
  onJump: (index: number) => void;
};

function TreemapBreadcrumb({ trail, onJump }: TreemapBreadcrumbProps): React.JSX.Element {
  return (
    <nav aria-label="Хлебные крошки каталога" className="sd-treemap-breadcrumb">
      <ol className="sd-treemap-crumbs">
        {trail.map((node, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${node.path}::${index}`} className="sd-treemap-crumb">
              {index > 0 && (
                <span aria-hidden="true" className="sd-treemap-separator">
                  /
                </span>
              )}
              {isLast ? (
                <span aria-current="page" className="sd-treemap-crumb-current">
                  {node.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="sd-treemap-crumb-button"
                  onClick={() => onJump(index)}
                  title={node.path}
                >
                  {node.name}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default TreemapBreadcrumb;
