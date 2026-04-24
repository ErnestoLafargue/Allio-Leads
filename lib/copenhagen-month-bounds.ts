import type { PrismaClient } from "@prisma/client";

export type CopenhagenMonthBounds = {
  start: Date;
  endExclusive: Date;
  /** fx «april 2026» */
  labelDa: string;
  year: number;
  month: number;
};

function isValidYearMonth(year: number, month: number) {
  return Number.isInteger(year) && year >= 2020 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

/**
 * Første øjeblik i kalendermåned (Europe/Copenhagen) og første øjeblik i næste måned (til `<` queries).
 */
export async function getCopenhagenMonthBounds(
  prisma: Pick<PrismaClient, "$queryRaw">,
  yearMonth?: { year: number; month: number },
): Promise<CopenhagenMonthBounds> {
  if (yearMonth && isValidYearMonth(yearMonth.year, yearMonth.month)) {
    const { year, month } = yearMonth;
    const rows = await prisma.$queryRaw<Array<{ start: Date; endExclusive: Date }>>`
      SELECT
        make_timestamptz(${year}, ${month}, 1, 0, 0, 0::double precision, 'Europe/Copenhagen') AS start,
        make_timestamptz(${year}, ${month}, 1, 0, 0, 0::double precision, 'Europe/Copenhagen')
          + interval '1 month' AS "endExclusive"
    `;
    const row = rows[0];
    if (!row) throw new Error("month bounds query returned no row");
    const labelDa = new Intl.DateTimeFormat("da-DK", {
      timeZone: "Europe/Copenhagen",
      month: "long",
      year: "numeric",
    }).format(row.start);
    return { start: row.start, endExclusive: row.endExclusive, labelDa, year, month };
  }

  const rows = await prisma.$queryRaw<Array<{ start: Date; endExclusive: Date; y: number; m: number }>>`
    SELECT
      make_timestamptz(
        EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::int,
        EXTRACT(MONTH FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::int,
        1, 0, 0, 0::double precision,
        'Europe/Copenhagen'
      ) AS start,
      make_timestamptz(
        EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::int,
        EXTRACT(MONTH FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::int,
        1, 0, 0, 0::double precision,
        'Europe/Copenhagen'
      ) + interval '1 month' AS "endExclusive",
      EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::int AS y,
      EXTRACT(MONTH FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::int AS m
  `;
  const row = rows[0];
  if (!row) throw new Error("current month bounds query returned no row");
  const labelDa = new Intl.DateTimeFormat("da-DK", {
    timeZone: "Europe/Copenhagen",
    month: "long",
    year: "numeric",
  }).format(row.start);
  return {
    start: row.start,
    endExclusive: row.endExclusive,
    labelDa,
    year: row.y,
    month: row.m,
  };
}
