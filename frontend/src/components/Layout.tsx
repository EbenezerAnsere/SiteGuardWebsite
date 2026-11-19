import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { siteName } from "../api";
import { useAuth } from "../auth";
import { useSites } from "../hooks";
import { AddSiteButton } from "./SiteManagement";
import { cx, GradeBadge, Logo } from "./ui";

const Icon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const NAV = [
  { to: "/", label: "Dashboard", hint: "Results overview", icon: <Icon d={<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>} /> },
  { to: "/security", label: "Security", hint: "All vulnerabilities", icon: <Icon d={<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /><path d="M12 8v4M12 15.5v.01" /></>} /> },
  { to: "/recommendations", label: "Recommendations", hint: "What to fix first", icon: <Icon d={<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0012 3z" /></>} /> },
  { to: "/performance", label: "Performance", hint: "Speed & page weight", icon: <Icon d={<><path d="M4 18a8 8 0 1116 0" /><path d="M12 18l4-6" /><circle cx="12" cy="18" r="1.2" /></>} /> },
  { to: "/terminology", label: "Terminology", hint: "Glossary of terms", icon: <Icon d={<><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" /><path d="M4 19a2 2 0 012-2h13M9 7h6M9 11h4" /></>} /> },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sites = useSites();
  const list = sites.data ?? [];

  let urgent = 0, toFix = 0;
  for (const s of list) {
    const c = s.latestCompleted?.summary?.counts;
    if (!c) continue;
    urgent += c.critical + c.high;
    toFix += c.critical + c.high + c.medium + c.low;
  }
  const badge: Record<string, ReactNode> = {
    "/security": urgent > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white" title={`${urgent} critical/high issues`}>{urgent}</span>,
    "/recommendations": toFix > 0 && <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-700">{toFix}</span>,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link to="/" onClick={onNavigate} aria-label="SiteGuard home"><Logo /></Link>
      </div>

      <nav className="space-y-1 px-3" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                isActive ? "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? "text-cyan-700" : "text-slate-400 group-hover:text-slate-600"}>{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.hint}</span>
                </span>
                {badge[item.to]}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your sites</p>
            <AddSiteButton variant="icon" label="Add website" />
          </div>
          {list.length === 0 && !sites.isLoading && <p className="px-3 text-sm text-slate-500">No websites yet.</p>}
          <ul className="space-y-0.5">
            {list.map((s) => (
              <li key={s.id}>
                <NavLink
                  to={`/sites/${s.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx("flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm", isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")
                  }
                >
                  <GradeBadge grade={s.latestCompleted?.grade ?? null} size="xs" />
                  <span className="truncate">{siteName(s)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-50 text-sm font-bold text-cyan-700 ring-1 ring-cyan-200" aria-hidden>
            {user?.email.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600" title={user?.email}>{user?.email}</span>
        </div>
        <button
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          onClick={async () => {
            await logout().catch(() => {});
            onNavigate?.();
            navigate("/login", { replace: true });
          }}
        >
          <Icon d={<><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>} />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>

      {/* mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/"><Logo /></Link>
        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Icon d={<path d="M4 6h16M4 12h16M4 18h16" />} />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <Icon d={<path d="M6 6l12 12M18 6L6 18" />} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="px-4 py-8 lg:pl-64">
        <div className="mx-auto max-w-6xl lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
