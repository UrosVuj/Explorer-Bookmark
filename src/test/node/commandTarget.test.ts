import * as assert from "assert";
import { extractCommandTargetPath, isUriString } from "../../operator/CommandTarget";

suite("Command target helpers", () =>
{
  test("extracts a resource uri fsPath from explorer payloads", () =>
  {
    assert.strictEqual(
      extractCommandTargetPath({
        resourceUri: {
          fsPath: "/tmp/bookmark.txt",
        },
      }),
      "/tmp/bookmark.txt"
    );
  });

  test("extracts a plain path payload", () =>
  {
    assert.strictEqual(
      extractCommandTargetPath({
        path: "/tmp/bookmarked-folder",
      }),
      "/tmp/bookmarked-folder"
    );
  });

  test("prefers fsPath over path when both are available", () =>
  {
    assert.strictEqual(
      extractCommandTargetPath({
        fsPath: "/tmp/from-fs-path",
        path: "file:///tmp/from-uri-path",
      }),
      "/tmp/from-fs-path"
    );
  });

  test("detects uri strings", () =>
  {
    assert.strictEqual(isUriString("file:///tmp/bookmark.txt"), true);
    assert.strictEqual(isUriString("/tmp/bookmark.txt"), false);
  });
});
