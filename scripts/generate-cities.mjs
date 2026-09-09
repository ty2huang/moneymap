// Refresh the public-domain IANA city/country catalog used by onboarding.
// Source: https://data.iana.org/time-zones/tzdb/zone.tab
import { writeFile } from "node:fs/promises";

const response = await fetch("https://data.iana.org/time-zones/tzdb/zone.tab");
if (!response.ok) throw new Error(`IANA download failed: ${response.status}`);
const rows = (await response.text())
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [countryCode, , timezone] = line.split("\t");
    return { timezone, countryCode };
  });
await writeFile(
  new URL("../src/domain/cities.json", import.meta.url),
  JSON.stringify(rows, null, 2) + "\n",
);
