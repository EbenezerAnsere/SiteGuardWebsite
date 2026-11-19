import { describe, expect, it } from "vitest";
import type { Finding, Severity } from "../db/schema.js";
import { PENALTY, scoreFindings } from "./score.js";

const finding = (severity: Severity, passed = false): Finding => ({
  id: `${severity}-${Math.random()}`, category: "Test", title: severity, severity, passed, description: "",
});

describe("scoreFindings", () => {
  it("gives 100% and an A when every check passes", () => {
    expect(scoreFindings([finding("info", true), finding("high", true)])).toEqual({ score: 100, grade: "A" });
  });

  it("subtracts the documented penalty per failed check", () => {
    const findings = [finding("high"), finding("medium"), finding("low")];
    expect(scoreFindings(findings).score).toBe(100 - PENALTY.high - PENALTY.medium - PENALTY.low);
  });

  it("does not penalise info findings", () => {
    expect(scoreFindings([finding("info"), finding("info")]).score).toBe(100);
  });

  it("never goes below zero", () => {
    expect(scoreFindings(Array.from({ length: 10 }, () => finding("high"))).score).toBe(0);
  });

  it("caps the grade at F whenever a critical issue exists", () => {
    // 100 - 40 = 60 would normally be a D.
    expect(scoreFindings([finding("critical")])).toEqual({ score: 60, grade: "F" });
  });

  it.each([
    [[], "A"],
    [[finding("medium")], "A"],
    [[finding("high")], "B"],
    [[finding("high"), finding("medium")], "C"],
    [[finding("high"), finding("high")], "D"],
    [[finding("high"), finding("high"), finding("low")], "F"],
  ] as [Finding[], string][])("maps scores to grades (%#)", (findings, grade) => {
    expect(scoreFindings(findings).grade).toBe(grade);
  });
});
