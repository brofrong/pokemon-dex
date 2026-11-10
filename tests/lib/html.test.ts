import { expect, test } from "bun:test";
import { escapeHtml } from "../../src/lib/html";

test("escapeHtml escapes &, <, >, \" and '", () => {
  expect(escapeHtml("&")).toBe("&amp;");
  expect(escapeHtml("<")).toBe("&lt;");
  expect(escapeHtml(">")).toBe("&gt;");
  expect(escapeHtml('"')).toBe("&quot;");
  expect(escapeHtml("'")).toBe("&#39;");
});

test("escapeHtml escapes every special character in a mixed string, in source order", () => {
  expect(escapeHtml(`<b>&"'</b> > ok`)).toBe(
    "&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt; &gt; ok",
  );
});

test("escapeHtml leaves plain text untouched", () => {
  expect(escapeHtml("Solar Power")).toBe("Solar Power");
  expect(escapeHtml("Увеличивает приёмы типа Огонь")).toBe(
    "Увеличивает приёмы типа Огонь",
  );
});

test("escapeHtml never lets a crafted ability effect close the surrounding tag or inject one", () => {
  const malicious = `</p><img src=x onerror="alert('xss')">`;
  const escaped = escapeHtml(malicious);
  expect(escaped).not.toContain("<img");
  expect(escaped).not.toContain("</p>");
  expect(escaped).toBe(
    "&lt;/p&gt;&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;",
  );
});
