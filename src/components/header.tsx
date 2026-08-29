"use client";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/30 bg-background/80 px-8 backdrop-blur-xl">
      {/* Left: Page Title */}
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Dashboard
          </h2>
          <p className="text-[11px] font-medium text-muted-foreground">
            Multi-Agent Control Center
          </p>
        </div>
      </div>

      {/* Right: Status + Info */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex h-8 w-56 items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 text-sm text-muted-foreground transition-colors hover:border-border">
          <svg className="size-3.5 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <span className="text-xs">Search agents...</span>
          <span className="ml-auto rounded border border-border/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
            ⌘K
          </span>
        </div>

        {/* Notification Bell */}
        <button
          id="notifications-btn"
          className="relative flex size-8 items-center justify-center rounded-lg border border-border/30 bg-muted/20 text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <span className="absolute -top-0.5 -right-0.5 flex size-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-violet-500" />
          </span>
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5 transition-all hover:bg-muted/40">
          <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
            K
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-foreground">Kirana</p>
            <p className="text-[10px] text-muted-foreground">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
