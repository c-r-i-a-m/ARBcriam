import type { RecordEvent } from "@/types";

export function dedupeRecords(records: RecordEvent[]) {
  const seen = new Set<number>();
  const unique: RecordEvent[] = [];

  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    unique.push(record);
  }

  return unique;
}

export function appendRecordIfMissing(records: RecordEvent[], record: RecordEvent) {
  if (records.some((existing) => existing.id === record.id)) {
    return records;
  }

  return [...records, record];
}
