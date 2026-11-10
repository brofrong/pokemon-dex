import { expect, test } from "bun:test";
import { parseCsv } from "../../../scripts/data/csv";

test("quoted field with comma, newline and escaped quote", () => {
  expect(parseCsv('a,b\n1,"x, ""y""\nz"\n')).toEqual([
    { a: "1", b: 'x, "y"\nz' },
  ]);
});

test("CRLF and missing trailing newline", () => {
  expect(parseCsv("a,b\r\n1,2\r\n3,")).toEqual([
    { a: "1", b: "2" },
    { a: "3", b: "" },
  ]);
});

test("form-feed characters inside flavor text are preserved for later cleanup", () => {
  expect(parseCsv('t\n"a\fb"')[0].t).toBe("a\fb");
});
