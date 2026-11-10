import { expect, test } from "bun:test";
import { isOutsideClick } from "../../src/scripts/dismissable-details";

/** A minimal stand-in for a DOM `Node`, just enough for `isOutsideClick`'s `.contains()` call
 *  and its `nodeType` duck-type check -- no real DOM/browser environment needed. */
function fakeNode(containsTarget: boolean): Node {
  return { nodeType: 1, contains: () => containsTarget } as unknown as Node;
}
const fakeTarget = { nodeType: 3 } as unknown as EventTarget;

test("isOutsideClick is true for a click outside the element", () => {
  expect(isOutsideClick(fakeNode(false), fakeTarget)).toBe(true);
});

test("isOutsideClick is false for a click inside the element", () => {
  expect(isOutsideClick(fakeNode(true), fakeTarget)).toBe(false);
});

test("isOutsideClick is true when the event target isn't a Node at all", () => {
  expect(isOutsideClick(fakeNode(true), null)).toBe(true);
  expect(
    isOutsideClick(fakeNode(true), "not a node" as unknown as EventTarget),
  ).toBe(true);
});
