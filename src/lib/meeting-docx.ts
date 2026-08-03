import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { MeetingMinutes } from "./meeting.server";

function heading(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
  });
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}

function actionItemsTable(items: MeetingMinutes["actionItems"]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: ["Owner", "Task", "Due"].map(
      (t) =>
        new TableCell({
          width: { size: t === "Task" ? 50 : 25, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
        }),
    ),
  });
  const rows = items.map(
    (item) =>
      new TableRow({
        children: [item.owner, item.task, item.due ?? "—"].map(
          (cell) => new TableCell({ children: [new Paragraph(cell)] }),
        ),
      }),
  );
  return new Table({ rows: [headerRow, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** Builds a formatted Word document (.docx) Blob from structured minutes. */
export async function minutesToDocxBlob(minutes: MeetingMinutes): Promise<Blob> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: minutes.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
    }),
  ];

  if (minutes.date) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: minutes.date, italics: true })],
        spacing: { after: 200 },
      }),
    );
  }

  if (minutes.attendees.length) {
    children.push(heading("Attendees"));
    children.push(new Paragraph({ text: minutes.attendees.join(", "), spacing: { after: 120 } }));
  }

  if (minutes.summary) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ text: minutes.summary, spacing: { after: 120 } }));
  }

  if (minutes.agenda.length) {
    children.push(heading("Agenda"));
    children.push(...minutes.agenda.map(bullet));
  }

  if (minutes.discussion.length) {
    children.push(heading("Discussion"));
    for (const item of minutes.discussion) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: item.topic, bold: true })],
          spacing: { before: 100 },
        }),
      );
      children.push(new Paragraph({ text: item.notes, spacing: { after: 80 } }));
    }
  }

  if (minutes.decisions.length) {
    children.push(heading("Decisions"));
    children.push(...minutes.decisions.map(bullet));
  }

  if (minutes.actionItems.length) {
    children.push(heading("Action Items"));
    children.push(actionItemsTable(minutes.actionItems));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

/** Plain-markdown fallback of the same minutes, for the .md export path. */
export function minutesToMarkdown(minutes: MeetingMinutes): string {
  const lines: string[] = [`# ${minutes.title}`];
  if (minutes.date) lines.push(`*${minutes.date}*`);
  lines.push("");
  if (minutes.attendees.length) lines.push(`**Attendees:** ${minutes.attendees.join(", ")}`, "");
  if (minutes.summary) lines.push("## Summary", minutes.summary, "");
  if (minutes.agenda.length) lines.push("## Agenda", ...minutes.agenda.map((a) => `- ${a}`), "");
  if (minutes.discussion.length) {
    lines.push("## Discussion");
    for (const d of minutes.discussion) lines.push(`**${d.topic}**`, d.notes, "");
  }
  if (minutes.decisions.length) lines.push("## Decisions", ...minutes.decisions.map((d) => `- ${d}`), "");
  if (minutes.actionItems.length) {
    lines.push("## Action Items");
    lines.push("| Owner | Task | Due |", "| --- | --- | --- |");
    for (const a of minutes.actionItems) lines.push(`| ${a.owner} | ${a.task} | ${a.due ?? "—"} |`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Safe, filesystem-friendly filename base from a title + date. */
export function minutesFileBaseName(minutes: MeetingMinutes): string {
  const datePart = (minutes.date ?? new Date().toISOString()).slice(0, 10);
  const titlePart = minutes.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${datePart}-${titlePart || "meeting"}`;
}
