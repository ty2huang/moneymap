"use client";

import { useId, useRef, useState } from "react";
import {
  cityForTimezone,
  searchCities,
  type cityTimezoneOptions,
} from "@/domain/location";
import { Input } from "./ui/input";

type City = (typeof cityTimezoneOptions)[number];

export function CityInput({
  timezone,
  onChange,
}: {
  timezone: string;
  onChange: (timezone: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(
    () => cityForTimezone(timezone)?.label ?? "",
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = searchCities(query);
  const searching = open && query.trim().length >= 2;
  const expanded = searching && suggestions.length > 0;

  function select(city: City) {
    setQuery(city.label);
    onChange(city.timezone);
    input.current?.setCustomValidity("");
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative grid gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        City
      </label>
      <Input
        ref={input}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-suggestions` : undefined}
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-option-${active}` : undefined
        }
        autoComplete="off"
        placeholder="Start typing a city"
        required
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          const exact = searchCities(value).find(
            (city) => city.label.toLowerCase() === value.trim().toLowerCase(),
          );
          onChange(exact?.timezone ?? "");
          event.target.setCustomValidity(
            exact ? "" : "Choose a city from the suggestions.",
          );
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (
            (event.key === "ArrowDown" || event.key === "ArrowUp") &&
            suggestions.length
          ) {
            event.preventDefault();
            setOpen(true);
            const next =
              event.key === "ArrowDown"
                ? (active + 1) % suggestions.length
                : (active <= 0 ? suggestions.length : active) - 1;
            setActive(next);
            document
              .getElementById(`${id}-option-${next}`)
              ?.scrollIntoView({ block: "nearest" });
          } else if (event.key === "Enter" && expanded && active >= 0) {
            event.preventDefault();
            select(suggestions[active]);
          }
        }}
      />
      {expanded && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <ul
            id={`${id}-suggestions`}
            role="listbox"
            aria-label="City suggestions"
            className="max-h-60 overflow-y-auto p-1"
          >
            {suggestions.map((city, index) => (
              <li
                key={city.timezone}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted ${active === index ? "bg-muted" : ""}`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => select(city)}
              >
                {city.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {searching && suggestions.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No cities found. Try another city name.
        </p>
      )}
    </div>
  );
}
