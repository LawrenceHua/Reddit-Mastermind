interface WeekExportData {
  id: string;
  week_start_date: string;
  status: string;
  calendar_items: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    subreddits: { name: string } | null;
    personas: { name: string } | null;
    content_assets: Array<{
      id: string;
      asset_type: string;
      title: string | null;
      body_md: string;
      version: number;
      status: string;
    }>;
  }>;
}

interface ExportRow {
  scheduled_at: string;
  subreddit: string;
  persona: string;
  status: string;
  title: string;
  body: string;
  asset_type: string;
  version: number;
}

/**
 * Export week data to CSV format
 */
export function exportWeekToCSV(week: WeekExportData): string {
  const rows: ExportRow[] = [];

  for (const item of week.calendar_items) {
    for (const asset of item.content_assets) {
      if (asset.status !== 'active') continue;

      rows.push({
        scheduled_at: item.scheduled_at,
        subreddit: item.subreddits?.name ?? '',
        persona: item.personas?.name ?? '',
        status: item.status,
        title: asset.title ?? '',
        body: asset.body_md,
        asset_type: asset.asset_type,
        version: asset.version,
      });
    }
  }

  // Create CSV
  const headers = Object.keys(rows[0] || {});
  const csvRows = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof ExportRow];
          // Escape quotes and wrap in quotes
          const stringValue = String(value).replace(/"/g, '""');
          return `"${stringValue}"`;
        })
        .join(',')
    ),
  ];

  return csvRows.join('\n');
}

/**
 * Export week data to JSON format
 */
export function exportWeekToJSON(week: WeekExportData): object {
  return {
    week_id: week.id,
    week_start_date: week.week_start_date,
    status: week.status,
    exported_at: new Date().toISOString(),
    items: week.calendar_items.map((item) => ({
      id: item.id,
      scheduled_at: item.scheduled_at,
      subreddit: item.subreddits?.name,
      persona: item.personas?.name,
      status: item.status,
      assets: item.content_assets
        .filter((a) => a.status === 'active')
        .map((asset) => ({
          type: asset.asset_type,
          title: asset.title,
          body: asset.body_md,
          version: asset.version,
        })),
    })),
  };
}
