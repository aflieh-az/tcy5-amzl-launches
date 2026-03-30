# TCY5 Floor Layout — Collaboration Tool

## Problem Statement: Floor Layout Planning at AR Sort Centers

Today, when MFO Engineers and OPS Managers need to plan floor layout changes at AR sort centers — whether launching new AMZL lanes, rebalancing volume across waves, or responding to peak season shifts — the process is manual, fragmented, and slow.

Layout planning currently happens across disconnected spreadsheets, email threads, and whiteboard sessions. An MFO engineer pulls sortation rules from STEM, cross-references SPOT volume data, sketches chute reassignments in Excel, then walks the floor with OPS to explain the proposal verbally. There's no shared visual workspace where both teams can see the current state, propose changes, understand the impact, and document the rationale — all in one place.

This creates several pain points:

- **No single source of truth.** Layout proposals live in scattered Excel files and Slack messages. When OPS asks "why did we move this chute?", the answer is buried in someone's email from 3 weeks ago.

- **Slow iteration cycles.** Every layout change idea requires the MFO engineer to manually update a spreadsheet, recalculate ADV impacts, and re-share. A brainstorming session that should take 30 minutes turns into days of back-and-forth.

- **No before/after visibility.** When reviewing a proposed layout change, there's no easy way to see what the floor looked like before vs. after. Teams approve changes without fully understanding the scope of what's shifting.

- **Lost context.** The reasoning behind layout decisions — "we moved DSR2 to row 10 because rows 14-16 cause drive congestion" — isn't captured anywhere. When the next MFO engineer inherits the site, they have no idea why the floor looks the way it does.

- **No scenario comparison.** When evaluating multiple layout options ("Option A: consolidate on Lane 6" vs "Option B: spread across Lanes 6 and 7"), there's no way to save, switch between, and compare them side by side.

**This tool solves all of that.** It gives MFO and OPS a shared, interactive floor layout workspace where they can drag-and-drop chute assignments, annotate every change with the reasoning, toggle between before/after views, compare multiple scenarios, and export a documented change proposal — all from a single HTML page built directly from the site's own STEM and layout data. No installs, no accounts, no infrastructure. Just open the file and start planning.

---

## How It Works

1. The build script reads `TCY5_Data.xlsx` (layout_view + Sortation_Rules sheets)
2. Generates a self-contained `dist/design-tool.html` with all data baked in
3. Open the HTML file in any browser — no server needed

## Quick Start

```bash
cd tcy5_amzl_launches
node build-design-tool.js
# Open dist/design-tool.html in your browser
```

## Features

**Design & Layout**
- Interactive 16×21 grid matching the physical AR floor
- Drag-and-drop to swap chute assignments
- Multi-select (Ctrl+Click, Shift+Click for range)
- Bulk operations: clear, set filter, toggle FLAT/Multi
- Add new lanes dynamically
- Search/filter highlight
- Right-click context menu

**Collaboration**
- Cell-level notes/annotations ("why did we make this change?")
- Before/After toggle view
- Auto-generated Change Proposal table
- Impact dashboard (ADV shifts per lane, type flips)
- Save/load multiple scenarios for comparison
- Export to CSV with notes and change flags

**Visual Change Tracking**
- Color-coded change badges: SWAP (blue), NEW (green), CLR (red), MOD (orange)
- Pulsing glow animation on modified cells
- "Was:" label showing original value on each changed cell
- Orange border on any cell that differs from original

**Keyboard Shortcuts**
- `Ctrl+Z` — Undo
- `Ctrl+A` — Select all
- `Escape` — Deselect / cancel
- `Delete` — Clear selected cells
- `S` — Toggle select mode
