import cities from "./cities.json";

export function cityFromTimezone(timezone: string) {
  return timezone.split("/").at(-1)!.replaceAll("_", " ");
}

const countries = new Intl.DisplayNames(["en"], { type: "region" });

function canonicalTimezone(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: timezone,
    }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export const cityTimezoneOptions = cities
  .filter(({ timezone }) => canonicalTimezone(timezone))
  .map(({ timezone, countryCode }) => ({
    timezone,
    city: cityFromTimezone(timezone),
    country: countries.of(countryCode) ?? countryCode,
    label: `${cityFromTimezone(timezone)}, ${countries.of(countryCode) ?? countryCode}`,
  }))
  .sort((a, b) => a.city.localeCompare(b.city));

export function cityForTimezone(timezone: string) {
  if (!timezone) return undefined;
  const exact = cityTimezoneOptions.find(
    (option) => option.timezone === timezone,
  );
  if (exact) return exact;
  const canonical = canonicalTimezone(timezone);
  if (!canonical) return undefined;
  return cityTimezoneOptions.find(
    (option) => canonicalTimezone(option.timezone) === canonical,
  );
}

export function searchCities(query: string) {
  const search = query.trim().toLocaleLowerCase("en");
  if (search.length < 2) return [];
  return cityTimezoneOptions.filter((option) =>
    option.label.toLocaleLowerCase("en").startsWith(search),
  );
}
