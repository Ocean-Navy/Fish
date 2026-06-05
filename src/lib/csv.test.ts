import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, toCsv } from "./csv";

test("csvCell quotes values and escapes double quotes", () => {
  assert.equal(csvCell('dock "alpha"'), '"dock ""alpha"""');
});

test("csvCell neutralizes spreadsheet formulas", () => {
  for (const value of ["=2+3", "+1+1", "-10+20", "@SUM(A1:A2)", " \t=WEBSERVICE(\"https://example.test\")", "\r+SUM(A1:A2)", "\n-1+2"]) {
    const cell = csvCell(value);

    assert.equal(cell.startsWith('"\''), true, value);
  }
});

test("toCsv applies formula neutralization to exported rows", () => {
  const csv = toCsv(["contact", "notes"], [["=HYPERLINK(\"https://example.test\")", "safe"]]);

  assert.equal(csv, '"contact","notes"\n"\'=HYPERLINK(""https://example.test"")","safe"');
});
