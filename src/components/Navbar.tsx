export type ActivePage = 'library' | 'wallpaper' | 'control';

interface NavbarProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
  onSyncAllToDevice: () => void;
  isSyncing: boolean;
}

export function Navbar({
  activePage,
  onNavigate,
  onSyncAllToDevice,
  isSyncing,
}: NavbarProps) {
  const navItems: { id: ActivePage; label: string }[] = [
    { id: 'library', label: 'Music Library' },
    { id: 'wallpaper', label: 'Wallpaper Studio' },
    { id: 'control', label: 'Control & Status' },
  ];

  return (
    <header className="border-b border-slate-800/80 bg-[#0b0f17]/95 backdrop-blur">
      <div className="mx-auto flex flex-wrap md:flex-nowrap max-w-7xl items-center justify-between gap-y-2 gap-x-3 md:gap-8 px-3 sm:px-6 py-2.5 sm:py-3.5 min-w-0">
        {/* Zone 1: Brand wordmark (single text element) */}
        <a
          href="#library"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('library');
          }}
          className="min-h-[44px] inline-flex items-center text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          PocketAudio C3
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="order-3 md:order-2 flex flex-wrap w-full md:w-auto items-center justify-between sm:justify-start gap-x-2 gap-y-1 sm:gap-6 text-xs sm:text-sm font-medium border-t border-slate-800/70 pt-1.5 md:border-t-0 md:pt-0 min-w-0"
        >
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[44px] md:min-h-[36px] inline-flex items-center px-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  isActive
                    ? 'border-amber-400 text-amber-300 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-700'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="order-2 md:order-3 flex items-center shrink-0">
          <button
            type="button"
            onClick={onSyncAllToDevice}
            disabled={isSyncing}
            className="min-h-[44px] md:min-h-[38px] inline-flex items-center justify-center px-3.5 sm:px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isSyncing ? 'Queuing Sync...' : 'Sync to ESP32-C3'}
          </button>
        </div>
      </div>
    </header>
  );
}
