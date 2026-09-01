import {
  ATTENDANCE_BY_KEY,
  APP,
  STATUS_BY_KEY,
  formatDuration,
  scoreFor,
} from "../config";
import { clock, dateLong, weekdayLong } from "./date";
import type { Member, RowGroup } from "./types";

/**
 * Landscape A4. Widths are in mm and are chosen to fill the printable width
 * exactly, so autoTable never has to shrink or clip a column — long text wraps
 * inside its cell instead, and the row grows.
 */
const MARGIN = 10;
const PAGE_W = 297;
const USABLE = PAGE_W - MARGIN * 2; // 277mm

const COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "rank", header: "#", width: 8 },
  { key: "member", header: "Member", width: 24 },
  { key: "day", header: "Day", width: 24 },
  { key: "task", header: "Task", width: 55 },
  { key: "detail", header: "Detail", width: 46 },
  { key: "time", header: "Time", width: 15 },
  { key: "status", header: "Status", width: 21 },
  { key: "efficiency", header: "Efficiency", width: 18 },
  { key: "impact", header: "Impact", width: 15 },
  { key: "score", header: "Score", width: 14 },
  { key: "remarks", header: "Remarks", width: 37 },
];

const INK: [number, number, number] = [23, 23, 26];
const MUTED: [number, number, number] = [120, 120, 127];
const LINE: [number, number, number] = [225, 225, 221];
const BAND: [number, number, number] = [247, 247, 245];

function summarise(groups: RowGroup[]) {
  let reported = 0;
  let working = 0;
  let off = 0;
  let tasks = 0;
  let done = 0;
  let open = 0;
  let minutes = 0;
  let rated = 0;
  let impactSum = 0;
  let efficiencySum = 0;
  for (const g of groups) {
    if (g.dayLog !== null || g.entries.length > 0) reported++;
    if (g.dayLog) {
      if (g.dayLog.attendance === "week_off" || g.dayLog.attendance === "leave")
        off++;
      else working++;
    }
    for (const e of g.entries) {
      tasks++;
      if (e.status === "done") done++;
      else open++;
      if (e.minutes) minutes += e.minutes;
      if (e.impact && e.efficiency) {
        rated++;
        impactSum += e.impact;
        efficiencySum += e.efficiency;
      }
    }
  }
  return {
    reported,
    total: groups.length,
    working,
    off,
    tasks,
    done,
    open,
    minutes,
    avgImpact: rated ? impactSum / rated : null,
    avgEfficiency: rated ? efficiencySum / rated : null,
  };
}

/**
 * One row per task; a member with nothing logged still gets a row.
 * The name is repeated on every row so each line stands alone across a page
 * break, but the points and the day detail appear only on the first, so a
 * block does not read as a set of duplicates.
 */
function buildRows(groups: RowGroup[]) {
  const rows: {
    cells: string[];
    group: number;
    empty: boolean;
    first: boolean;
  }[] = [];
  groups.forEach((g, index) => {
    const att = g.dayLog ? ATTENDANCE_BY_KEY[g.dayLog.attendance] : null;
    const day = [att ? att.label : "Not marked", g.dayLog?.note]
      .filter(Boolean)
      .join(" — ");
    const lead = `${g.member.name}${g.score ? `\n${g.score.toLocaleString("en-IN")} pts` : ""}`;

    if (g.entries.length === 0) {
      rows.push({
        cells: [String(g.rank), lead, day, "No entries logged.", "", "", "", "", "", "", ""],
        group: index,
        empty: true,
        first: true,
      });
      return;
    }
    g.entries.forEach((e, i) => {
      rows.push({
        cells: [
          i === 0 ? String(g.rank) : "",
          i === 0 ? lead : g.member.name,
          i === 0 ? day : "",
          e.created_by === null ? `${e.title}\n(assigned)` : e.title,
          e.details ?? "",
          formatDuration(e.minutes),
          STATUS_BY_KEY[e.status].label,
          e.efficiency ? `${e.efficiency} / 5` : "—",
          e.impact ? `${e.impact} / 5` : "—",
          String(scoreFor(e.minutes, e.efficiency, e.impact)),
          e.remarks ?? "",
        ],
        group: index,
        empty: false,
        first: i === 0,
      });
    });
  });
  return rows;
}

/** Builds the document. Separated from saving so it can be inspected in tests. */
export async function buildDayReport(
  date: string,
  groups: RowGroup[],
): Promise<{ doc: any; rows: number }> {
  // loaded on demand so the PDF engine stays out of the main bundle
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const s = summarise(groups);
  const rows = buildRows(groups);
  const generated = clock(new Date().toISOString());

  autoTable(doc, {
    head: [COLUMNS.map((c) => c.header)],
    body: rows.map((r) => r.cells),
    startY: MARGIN + 24,
    margin: { top: MARGIN + 24, right: MARGIN, bottom: MARGIN + 8, left: MARGIN },
    theme: "grid",
    tableWidth: USABLE,
    rowPageBreak: "avoid", // never split one task's row across two pages
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      overflow: "linebreak", // wrap, never clip or spill
      valign: "top",
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: INK,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
    },
    columnStyles: Object.fromEntries(
      COLUMNS.map((c, i) => [
        i,
        {
          cellWidth: c.width,
          halign: ["rank", "efficiency", "impact", "score"].includes(c.key)
            ? "center"
            : "left",
          fontStyle: c.key === "task" ? "bold" : "normal",
        },
      ]),
    ),
    // shade alternate members so each person's block reads as one unit
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = rows[data.row.index];
      if (!row) return;
      if (row.group % 2 === 1) data.cell.styles.fillColor = BAND;
      if (row.empty && data.column.index === 3) {
        data.cell.styles.textColor = MUTED;
        data.cell.styles.fontStyle = "italic";
      }
      if (["detail", "remarks"].includes(COLUMNS[data.column.index]?.key)) {
        data.cell.styles.textColor = MUTED;
      }
      // a continuation line keeps the name for context but steps back visually
      if (!row.first && data.column.index === 1) {
        data.cell.styles.textColor = MUTED;
      }
    },
    // page furniture, drawn on every page so the header repeats
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...INK);
      doc.text(`${weekdayLong(date)}`, MARGIN, MARGIN + 7);

      const dayWidth = doc.getTextWidth(`${weekdayLong(date)}`);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(dateLong(date), MARGIN + dayWidth + 4, MARGIN + 7);

      doc.setFontSize(8);
      doc.text(
        `${APP.org} — ${APP.title}`,
        PAGE_W - MARGIN,
        MARGIN + 4,
        { align: "right" },
      );
      doc.text(
        `Generated ${generated} ${APP.timezone.replace("_", " ")}`,
        PAGE_W - MARGIN,
        MARGIN + 8.5,
        { align: "right" },
      );

      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      const bits = [
        `Reported ${s.reported}/${s.total}`,
        `Working ${s.working}`,
        `Off ${s.off}`,
        `Tasks ${s.tasks}`,
        `Done ${s.done}`,
        `Open ${s.open}`,
        `Time ${formatDuration(s.minutes)}`,
        `Avg efficiency ${s.avgEfficiency !== null ? s.avgEfficiency.toFixed(2) : "—"}`,
        `Avg impact ${s.avgImpact !== null ? s.avgImpact.toFixed(2) : "—"}`,
      ];
      doc.text(bits.join("    "), MARGIN, MARGIN + 15);

      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, MARGIN + 18.5, PAGE_W - MARGIN, MARGIN + 18.5);

      // the page number is stamped after layout, once the total is known —
      // painting a provisional one here would leave hidden duplicate text
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`${APP.org} internal`, MARGIN, 210 - 6);
    },
  });

  // stamp the true page count now that the table has been laid out
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, 210 - 6, {
      align: "right",
    });
  }

  return { doc, rows: rows.length };
}

export async function downloadDayReport(
  date: string,
  groups: RowGroup[],
  _memberById?: Map<string, Member>,
): Promise<void> {
  const { doc } = await buildDayReport(date, groups);
  doc.save(`inmyarc-${date}.pdf`);
}

/** Exported for tests: the column plan must always fill the page exactly. */
export const REPORT_COLUMNS = COLUMNS;
export const REPORT_USABLE_WIDTH = USABLE;
