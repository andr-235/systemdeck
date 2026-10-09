export type AppPage = 'dashboard' | 'processes' | 'storage' | 'cleaner';

type AppNavProps = {
  page: AppPage;
  onNavigate: (page: AppPage) => void;
};

const NAV_ITEMS: ReadonlyArray<{ page: AppPage; label: string }> = [
  { page: 'dashboard', label: 'Обзор' },
  { page: 'processes', label: 'Процессы' },
  { page: 'storage', label: 'Хранилище' },
  { page: 'cleaner', label: 'Очистка' },
];

function AppNav({ page, onNavigate }: AppNavProps): React.JSX.Element {
  return (
    <nav className="sd-nav" aria-label="Разделы">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.page}
          type="button"
          className="sd-nav-button"
          aria-current={page === item.page ? 'page' : undefined}
          onClick={() => onNavigate(item.page)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export default AppNav;
