export function readPackRecord(result) {
  const records = Array.isArray(result)
    ? result
    : result !== null && typeof result === "object"
      ? Object.values(result)
      : [];

  if (records.length !== 1) {
    throw new Error(`Expected one packed artifact, received ${records.length}.`);
  }

  const record = records[0];
  if (record === null || typeof record !== "object" || typeof record.filename !== "string") {
    throw new Error("npm pack returned an invalid artifact record.");
  }

  return record;
}
