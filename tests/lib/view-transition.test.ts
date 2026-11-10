import { beforeEach, expect, test } from "bun:test";
import {
  LIST_VT_CAP,
  listVtNames,
  resetViewTransitionState,
  swallowTransitionAborts,
  VT_ABORT_GUARD_SCRIPT,
  vtName,
  withViewTransition,
  type VtEnv,
} from "../../src/lib/view-transition";

test("the inline abort guard cancels only aborted-transition rejections", () => {
  let handler: ((e: unknown) => void) | undefined;
  const addEventListener = (type: string, fn: (e: unknown) => void) => {
    if (type === "unhandledrejection") handler = fn;
  };
  new Function("addEventListener", VT_ABORT_GUARD_SCRIPT)(addEventListener);
  expect(handler).toBeDefined();
  const fire = (reason: unknown) => {
    let prevented = false;
    handler!({ reason, preventDefault: () => (prevented = true) });
    return prevented;
  };
  const err = (name: string, message: string) =>
    Object.assign(new Error(message), { name });
  expect(
    fire(
      err(
        "InvalidStateError",
        "Transition was aborted because of invalid state. ViewTransition opt-in disabled",
      ),
    ),
  ).toBe(true);
  expect(fire(err("InvalidStateError", "Something else"))).toBe(false);
  expect(fire(err("TypeError", "Transition was aborted"))).toBe(false);
  expect(fire(undefined)).toBe(false);
  expect(VT_ABORT_GUARD_SCRIPT.length).toBeLessThan(250);
});

/** A controllable stand-in for a browser `ViewTransition`. */
interface FakeTransition {
  callback: () => unknown;
  skipped: boolean;
  finish: () => void;
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

function fakeEnv(
  opts: { api?: boolean; reduce?: boolean; throws?: boolean } = {},
) {
  const transitions: FakeTransition[] = [];
  const classes = new Set<string>();
  const env: VtEnv = {
    matchMedia: (q: string) => ({
      matches: Boolean(opts.reduce) && q.includes("reduce"),
    }),
    document: {
      documentElement: {
        classList: {
          add: (c: string) => void classes.add(c),
          remove: (c: string) => void classes.delete(c),
        },
      },
    },
  };
  if (opts.api !== false) {
    env.document!.startViewTransition = (callback: () => unknown) => {
      if (opts.throws) throw new Error("boom");
      let finish!: () => void;
      const finished = new Promise<void>((r) => (finish = r));
      const t: FakeTransition = {
        callback,
        skipped: false,
        finish,
        finished,
        // Real browsers reject `ready` when a transition is skipped; an unhandled rejection
        // would surface as a console error, so the helper must swallow it.
        ready: Promise.reject(new Error("AbortError")),
        updateCallbackDone: Promise.resolve(),
        skipTransition() {
          t.skipped = true;
          t.callback();
          t.finish();
        },
      };
      transitions.push(t);
      return t;
    };
  }
  return { env, transitions, classes };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => resetViewTransitionState());

test("vtName keeps its trivial shape", () => {
  expect(vtName("sprite", "479-heat")).toBe("sprite-479-heat");
});

test("no View Transitions API: update runs directly and synchronously", () => {
  const { env } = fakeEnv({ api: false });
  let ran = 0;
  withViewTransition(() => void ran++, {}, env);
  expect(ran).toBe(1);
});

test("no document at all (SSR/tests): update still runs", () => {
  let ran = 0;
  withViewTransition(() => void ran++, {}, {});
  expect(ran).toBe(1);
});

test("reduced motion: update runs directly, no transition is started", () => {
  const { env, transitions } = fakeEnv({ reduce: true });
  let ran = 0;
  let before = 0;
  withViewTransition(() => void ran++, { before: () => void before++ }, env);
  expect(ran).toBe(1);
  expect(before).toBe(0);
  expect(transitions.length).toBe(0);
});

test("skip option: update runs directly", () => {
  const { env, transitions } = fakeEnv();
  let ran = 0;
  withViewTransition(() => void ran++, { skip: true }, env);
  expect(ran).toBe(1);
  expect(transitions.length).toBe(0);
});

test("API available: update is wrapped; before/after hooks and root class bracket it", async () => {
  const { env, transitions, classes } = fakeEnv();
  const log: string[] = [];
  withViewTransition(
    () => void log.push("update"),
    {
      before: () => void log.push("before"),
      after: () => void log.push("after"),
      rootClass: "vt-list",
    },
    env,
  );
  expect(transitions.length).toBe(1);
  expect(log).toEqual(["before"]);
  expect(classes.has("vt-list")).toBe(true);
  transitions[0]!.callback();
  expect(log).toEqual(["before", "update"]);
  transitions[0]!.finish();
  await tick();
  expect(log).toEqual(["before", "update", "after"]);
  expect(classes.has("vt-list")).toBe(false);
});

test("re-entrancy: a call during a running transition flushes the pending update first, skips the transition and runs directly", async () => {
  const { env, transitions } = fakeEnv();
  const log: string[] = [];
  withViewTransition(
    () => void log.push("a"),
    { after: () => void log.push("after-a") },
    env,
  );
  expect(log).toEqual([]);
  withViewTransition(() => void log.push("b"), {}, env);
  // Order preserved: the superseded update still ran, before the new one, exactly once.
  expect(log).toEqual(["a", "b"]);
  expect(transitions.length).toBe(1);
  expect(transitions[0]!.skipped).toBe(true);
  await tick();
  expect(log).toEqual(["a", "b", "after-a"]);
  // The browser invoking the old callback late must not re-run it.
  transitions[0]!.callback();
  expect(log.filter((x) => x === "a").length).toBe(1);
  // Once the old one has settled, the next call animates again.
  withViewTransition(() => void log.push("c"), {}, env);
  expect(transitions.length).toBe(2);
});

test("update learns whether it runs inside a transition", async () => {
  const { env, transitions } = fakeEnv();
  const seen: boolean[] = [];
  withViewTransition((t) => void seen.push(t), {}, env);
  transitions[0]!.callback();
  // Re-entrant call while the first is still running: direct.
  withViewTransition((t) => void seen.push(t), {}, env);
  expect(seen).toEqual([true, false]);
  await tick();
  withViewTransition((t) => void seen.push(t), {}, fakeEnv({ api: false }).env);
  withViewTransition(
    (t) => void seen.push(t),
    {},
    fakeEnv({ reduce: true }).env,
  );
  expect(seen).toEqual([true, false, false, false]);
});

test("startViewTransition throwing never throws out of the helper; update still applies and after runs", () => {
  const { env, classes } = fakeEnv({ throws: true });
  const log: string[] = [];
  expect(() =>
    withViewTransition(
      (inTransition) => void log.push(`update:${inTransition}`),
      { after: () => void log.push("after"), rootClass: "x" },
      env,
    ),
  ).not.toThrow();
  // No transition will capture anything, so the update must not think it's inside one.
  expect(log).toEqual(["update:false", "after"]);
  expect(classes.has("x")).toBe(false);
});

test("a superseded transition's pending update is flushed as a direct update", () => {
  const { env } = fakeEnv();
  const seen: string[] = [];
  withViewTransition((t) => void seen.push(`a:${t}`), {}, env);
  withViewTransition((t) => void seen.push(`b:${t}`), {}, env);
  expect(seen).toEqual(["a:false", "b:false"]);
});

test("swallowTransitionAborts handles every rejecting promise and resolves", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => void unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  const abort = () => Promise.reject(new Error("Transition was aborted"));
  await expect(
    swallowTransitionAborts({
      ready: abort(),
      updateCallbackDone: abort(),
      finished: abort(),
    }),
  ).resolves.toBeUndefined();
  await expect(swallowTransitionAborts(null)).resolves.toBeUndefined();
  await tick();
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toEqual([]);
});

test("a rejecting finished promise still runs cleanup", async () => {
  const { env } = fakeEnv();
  env.document!.startViewTransition = () => ({
    finished: Promise.reject(new Error("update failed")),
    ready: Promise.reject(new Error("x")),
    updateCallbackDone: Promise.reject(new Error("x")),
  });
  let after = 0;
  withViewTransition(() => {}, { after: () => void after++ }, env);
  await tick();
  expect(after).toBe(1);
});

test("listVtNames: one unique name per card, duplicates collapsed", () => {
  const names = listVtNames([1, 2, 2, 3, 1]);
  expect(names).not.toBeNull();
  expect([...names!.keys()]).toEqual([1, 2, 3]);
  const values = [...names!.values()];
  expect(new Set(values).size).toBe(values.length);
  expect(values).toEqual(["lc-1", "lc-2", "lc-3"]);
});

test("listVtNames never collides with the cross-document sprite/name/types names", () => {
  for (const name of listVtNames([25, 133])!.values()) {
    for (const kind of ["sprite", "name", "types"] as const) {
      expect(name).not.toBe(vtName(kind, name.slice(3)));
    }
  }
});

test("listVtNames: over the cap returns null (caller skips the transition)", () => {
  const ids = Array.from({ length: LIST_VT_CAP + 1 }, (_, i) => i + 1);
  expect(listVtNames(ids)).toBeNull();
  expect(listVtNames(ids.slice(0, LIST_VT_CAP))!.size).toBe(LIST_VT_CAP);
  expect(listVtNames([1, 2, 3], 2)).toBeNull();
});
