// ABOUTME: Tests for custom-domain matching, including `*.example.com` wildcard entries.
// ABOUTME: Covers the matcher shared by on-demand TLS validation and request routing.

import { describe, test, expect } from "bun:test";
import { domainMatches, siteHasDomain } from "./site";
import type { Site } from "../schema";

describe("domainMatches", () => {
  test("exact hostnames match case-insensitively", () => {
    expect(domainMatches("example.com", "example.com")).toBe(true);
    expect(domainMatches("Example.COM", "example.com")).toBe(true);
    expect(domainMatches("example.com", "www.example.com")).toBe(false);
  });

  test("wildcard matches exactly one label below the base", () => {
    expect(domainMatches("*.pollen.place", "keith.pollen.place")).toBe(true);
    expect(domainMatches("*.pollen.place", "a-b.pollen.place")).toBe(true);
    expect(domainMatches("*.pollen.place", "pollen.place")).toBe(false);
    expect(domainMatches("*.pollen.place", "a.b.pollen.place")).toBe(false);
    expect(domainMatches("*.pollen.place", ".pollen.place")).toBe(false);
  });

  test("wildcard does not match lookalike domains", () => {
    expect(domainMatches("*.pollen.place", "notpollen.place")).toBe(false);
    expect(domainMatches("*.pollen.place", "keith.pollen.place.evil.com")).toBe(false);
  });

  test("a bare asterisk or empty input never matches", () => {
    expect(domainMatches("*", "anything.com")).toBe(false);
    expect(domainMatches("", "example.com")).toBe(false);
    expect(domainMatches("example.com", "")).toBe(false);
  });
});

describe("siteHasDomain", () => {
  const site = { custom_domains: JSON.stringify(["pollen.place", "*.pollen.place"]) } as Site;

  test("checks every entry on the site", () => {
    expect(siteHasDomain(site, "pollen.place")).toBe(true);
    expect(siteHasDomain(site, "keith.pollen.place")).toBe(true);
    expect(siteHasDomain(site, "www.keith.pollen.place")).toBe(false);
    expect(siteHasDomain(site, "other.place")).toBe(false);
  });

  test("tolerates malformed JSON", () => {
    expect(siteHasDomain({ custom_domains: "not json" } as Site, "pollen.place")).toBe(false);
  });
});
