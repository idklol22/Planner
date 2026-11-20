import { beforeAll, describe, expect, it } from "vitest";
import { call, seedDevice } from "./helpers";

const TOKEN = "calendar-token";

const baseTask = {
  title: "Study maths",
  date: "2026-11-20",
  categoryId: null,
  parentId: null,
  seriesId: null,
  order: 0,
  done: false,
  completedAt: null,
  durationMin: 45,
  deadline: false,
  kind: "study",
  note: null,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
  deletedAt: null,
};

beforeAll(async () => {
  await seedDevice(TOKEN);
  const response = await call("/ops", {
    method: "POST",
    token: TOKEN,
    body: {
      ops: [
        {
          table: "task",
          row: { ...baseTask, id: "ics-daily", time: "09:30", rrule: "daily", title: "Study maths" },
        },
        {
          table: "task",
          row: {
            ...baseTask,
            id: "ics-days",
            time: "14:00",
            rrule: "days:1,3,5",
            durationMin: null,
            title: "Gym, weights; stretching",
          },
        },
        {
          table: "task",
          row: { ...baseTask, id: "ics-no-time", time: null, rrule: null, title: "No time" },
        },
      ],
    },
  });
  expect(response.status).toBe(200);
});

describe("GET /cal/<secret>.ics", () => {
  it("emits timed tasks, RRULEs and escaped summaries without auth", async () => {
    const response = await call("/cal/test-secret.ics");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    const ics = await response.text();
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("DTSTART:20261120T093000\r\n");
    expect(ics).toContain("DTEND:20261120T101500\r\n");
    expect(ics).toContain("SUMMARY:Study maths\r\n");
    expect(ics).toContain("RRULE:FREQ=DAILY\r\n");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n");
    expect(ics).toContain("SUMMARY:Gym\\, weights\\; stretching\r\n");
    expect(ics).not.toContain("No time");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("hides the feed behind the configured secret", async () => {
    expect((await call("/cal/wrong.ics")).status).toBe(404);
  });
});
