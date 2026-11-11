"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  IconChartBar,
  IconDeviceTablet,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconPlayerStop,
  IconPackage,
  IconReceipt,
  IconRefresh,
  IconSettings,
  IconTag,
} from "@tabler/icons-react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { easeOut, springSnappy } from "@/lib/motion";
import { PERIODS, useOwner } from "./OwnerProvider";
import { PillSwitch } from "./PillSwitch";
import { EndTrialDialog } from "./EndTrialDialog";
import { TrialEnded, TrialStrip } from "./TrialStrip";
import "@/app/owner/owner.css";

const SECTIONS = [
  { href: "/owner", label: "Overview", key: "o", icon: IconLayoutDashboard },
  { href: "/owner/visits", label: "Visits", key: "v", icon: IconReceipt },
  { href: "/owner/shelf", label: "Shelf", key: "s", icon: IconPackage },
  { href: "/owner/products", label: "Products", key: "p", icon: IconTag },
  { href: "/owner/sales", label: "Sales", key: "a", icon: IconChartBar },
  { href: "/owner/setup", label: "Setup", key: "t", icon: IconSettings },
] as const;

/** Sections whose content does not follow the period, so the period switch and "Updated" are left out there. */
const NO_PERIOD = new Set<string>(["/owner/products", "/owner/setup"]);

const COLLAPSED_KEY = "shopsitter-owner-sidebar";

/** The section a path belongs to: a single visit sits under Visits. */
const sectionOf = (path: string) =>
  [...SECTIONS].reverse().find((s) => path === s.href || path.startsWith(`${s.href}/`)) ?? SECTIONS[0];

/** How deep a path is below /owner, so a move into a visit slides one way and the way back the other. */
const depth = (path: string) => path.split("/").filter(Boolean).length;

function age(loadedAt: number, now: number): string {
  const minutes = Math.floor((now - loadedAt) / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

/** True when a key press belongs to something the person is typing into or a dialog that is open. */
function typingOrDialog(target: EventTarget | null): boolean {
  if (document.querySelector("dialog[open], [role='dialog']:not(dialog)")) return true;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [role='textbox'], [role='combobox'], .ow-studio-frame") !== null
  );
}

const Keys = ({ children }: { children: string }) => (
  <kbd className="ow-kbd">{children}</kbd>
);

/** The owner area's frame: sidebar on a desktop, tab bar on a phone, and a top bar over the current section. */
export function OwnerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { shop, kind, trialStand, ended, markEnded, unmatched, days, changePeriod, refresh, refreshing, loadedAt, problem, clearProblem, signOut } =
    useOwner();
  const trial = kind === "trial";
  const [endAsked, setEndAsked] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(loadedAt);
  const section = sectionOf(pathname);
  const hasPeriod = !NO_PERIOD.has(section.href);

  // Which way the content arrives: sideways into and out of a visit, a small rise between sections.
  const [move, setMove] = useState({ path: pathname, from: "none" as "none" | "right" | "left" | "below" });
  if (move.path !== pathname) {
    const change = depth(pathname) - depth(move.path);
    setMove({ path: pathname, from: change > 0 ? "right" : change < 0 ? "left" : "below" });
  }

  useEffect(() => {
    // The choice is the viewer's own and is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true);
  }, []);

  function toggleSidebar() {
    setCollapsed((was) => {
      localStorage.setItem(COLLAPSED_KEY, was ? "0" : "1");
      return !was;
    });
  }

  // "Updated … ago" grows older on its own.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [loadedAt]);

  // Shortcuts: r refreshes, 1 2 3 pick the period, g then a letter moves between sections, / finds a visit.
  const goPending = useRef(0);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingOrDialog(e.target)) return;
      const key = e.key.toLowerCase();
      if (Date.now() - goPending.current < 1200) {
        goPending.current = 0;
        const to = SECTIONS.find((s) => s.key === key);
        if (to) {
          e.preventDefault();
          router.push(to.href);
          return;
        }
      }
      if (key === "g") goPending.current = Date.now();
      else if (key === "r") refresh();
      else if (key === "1" || key === "2" || key === "3") changePeriod(PERIODS[Number(key) - 1].days);
      else if (key === "/") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>(".ow-search input");
        if (search) search.focus();
        else router.push("/owner/visits");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, refresh, changePeriod]);

  const standName = trial ? "Your trial stand" : shop === "demo" ? "Demo stand" : "Your stand";
  // A trial's stand screen opens from its own link, which carries the key; the others ask for their code.
  const standHref = trial ? (trialStand?.standLink ?? "/owner/setup") : "/stand";
  // Signing a trial out would strand it, so its way out is to end it.
  const leaveLabel = trial ? "End trial stand" : "Sign out";
  const onLeave = trial ? () => setEndAsked(true) : signOut;
  const LeaveIcon = trial ? IconPlayerStop : IconLogout;
  const standNote =
    unmatched.length === 0 ? "Nothing unmatched" : `${unmatched.length} unmatched ${unmatched.length === 1 ? "visit" : "visits"}`;

  const enter =
    move.from === "right"
      ? { opacity: 0, x: 28 }
      : move.from === "left"
        ? { opacity: 0, x: -28 }
        : move.from === "below"
          ? { opacity: 0, y: 8 }
          : false;

  if (ended) return <TrialEnded />;

  return (
    <MotionConfig reducedMotion="user">
      <div className="ow-app" data-collapsed={collapsed || undefined}>
        <aside className="ow-side" aria-label="Owner area">
          <div className="ow-side-top">
            <Link href="/" className="wordmark ow-side-mark">
              Shopsitter
            </Link>
            <Tooltip content={collapsed ? "Open the sidebar" : "Collapse the sidebar"} placement="end">
              <button
                type="button"
                className="ow-icon-btn ds-press"
                aria-label={collapsed ? "Open the sidebar" : "Collapse the sidebar"}
                aria-expanded={!collapsed}
                onClick={toggleSidebar}
              >
                {collapsed ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
              </button>
            </Tooltip>
          </div>

          <div className="ow-stand" title={collapsed ? `${standName}: ${standNote}` : undefined}>
            <i className="ow-stand-dot" data-look={unmatched.length > 0 || undefined} aria-hidden="true" />
            <span className="ow-side-text">
              <b>{standName}</b>
              <span>{standNote}</span>
            </span>
          </div>

          <nav className="ow-nav" aria-label="Sections">
            {SECTIONS.slice(0, 5).map((s) => (
              <SideLink key={s.href} item={s} active={section.href === s.href} collapsed={collapsed}>
                {s.href === "/owner/visits" && unmatched.length > 0 && (
                  <span className="ow-nav-count" aria-label={`${unmatched.length} unmatched`}>
                    {unmatched.length}
                  </span>
                )}
              </SideLink>
            ))}
          </nav>

          <div className="ow-nav ow-nav-end">
            <SideLink item={SECTIONS[5]} active={section.href === SECTIONS[5].href} collapsed={collapsed} />
            <Tooltip content="Open stand screen" placement="end" isEnabled={collapsed}>
              <a href={standHref} target={trial && !trialStand ? undefined : "_blank"} rel="noreferrer" className="ow-nav-item">
                <IconDeviceTablet size={18} stroke={1.75} aria-hidden="true" />
                <span className="ow-side-text">Open stand screen</span>
              </a>
            </Tooltip>
            <Tooltip content={leaveLabel} placement="end" isEnabled={collapsed}>
              <button type="button" className="ow-nav-item" onClick={onLeave}>
                <LeaveIcon size={18} stroke={1.75} aria-hidden="true" />
                <span className="ow-side-text">{leaveLabel}</span>
              </button>
            </Tooltip>
          </div>
        </aside>

        <div className="ow-content">
          {trial && <TrialStrip now={now} />}
          <header className="ow-top">
            <h1 className="ow-top-title">{section.label}</h1>
            <div className="ow-top-tools">
              {hasPeriod && (
                <span className="ow-updated" aria-live="off">
                  {age(loadedAt, now)}
                </span>
              )}
              {hasPeriod && (
              <Tooltip
                content={
                  <>
                    Switch period <Keys>1</Keys> <Keys>2</Keys> <Keys>3</Keys>
                  </>
                }
                placement="below"
              >
                <span className="ow-top-period">
                  <PillSwitch
                    label="Period"
                    size="sm"
                    value={String(days)}
                    onChange={(value) => changePeriod(Number(value))}
                    options={PERIODS.map((p) => ({
                      value: String(p.days),
                      name: p.subtitle,
                      label: (
                        <>
                          <span className="ow-wide">{p.label}</span>
                          <span className="ow-narrow">{p.short}</span>
                        </>
                      ),
                    }))}
                  />
                </span>
              </Tooltip>
              )}
              <Tooltip
                content={
                  <>
                    Refresh <Keys>R</Keys>
                  </>
                }
                placement="below"
              >
                <button
                  type="button"
                  className="ow-icon-btn ow-refresh ds-press"
                  aria-label="Refresh"
                  aria-busy={refreshing || undefined}
                  disabled={refreshing}
                  onClick={refresh}
                >
                  <IconRefresh size={18} stroke={1.75} data-spin={refreshing || undefined} aria-hidden="true" />
                  <span className="ow-wide">Refresh</span>
                </button>
              </Tooltip>
              {!trial && (
                <button type="button" className="ow-icon-btn ow-top-out ds-press" aria-label="Sign out" onClick={signOut}>
                  <IconLogout size={18} stroke={1.75} aria-hidden="true" />
                </button>
              )}
            </div>
          </header>

          <main className="ow-main">
            {problem && (
              <div className="ow-notice">
                <Banner status="error" title={problem} isDismissable onDismiss={clearProblem} />
              </div>
            )}
            <motion.div
              key={pathname}
              className="ow-view"
              initial={enter}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.24, ease: easeOut }}
            >
              {children}
            </motion.div>
          </main>
        </div>

        {trial && <EndTrialDialog isOpen={endAsked} onOpenChange={setEndAsked} onEnded={markEnded} />}

        <nav className="ow-tabs" aria-label="Sections">
          {SECTIONS.map((s) => {
            const active = section.href === s.href;
            return (
              <Link key={s.href} href={s.href} className="ow-tab" aria-current={active ? "page" : undefined}>
                {active && <motion.span layoutId="ow-tab-pill" className="ow-tab-pill" transition={springSnappy} />}
                <s.icon size={21} stroke={1.75} aria-hidden="true" />
                <span>{s.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </MotionConfig>
  );
}

function SideLink({
  item,
  active,
  collapsed,
  children,
}: {
  item: (typeof SECTIONS)[number];
  active: boolean;
  collapsed: boolean;
  children?: ReactNode;
}) {
  return (
    <Tooltip
      content={
        <>
          {item.label} <Keys>G</Keys> <Keys>{item.key.toUpperCase()}</Keys>
        </>
      }
      placement="end"
      delay={collapsed ? 200 : 700}
    >
      <Link href={item.href} className="ow-nav-item" aria-current={active ? "page" : undefined}>
        {active && <motion.span layoutId="ow-nav-pill" className="ow-nav-pill" transition={springSnappy} />}
        <item.icon size={18} stroke={1.75} aria-hidden="true" />
        <span className="ow-side-text">{item.label}</span>
        {children}
      </Link>
    </Tooltip>
  );
}
