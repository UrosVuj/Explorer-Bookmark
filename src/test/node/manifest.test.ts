import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

type PackageJson = {
  contributes?: {
    menus?: Record<string, Array<Record<string, string>>>;
  };
};

suite("Extension manifest", () =>
{
  test("shows bookmark import/export directly in the view title overflow menu", () =>
  {
    const packageJsonPath = path.resolve(__dirname, "../../../package.json");
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8")
    ) as PackageJson;

    const viewTitleMenus = packageJson.contributes?.menus?.["view/title"] || [];

    assert.strictEqual(
      viewTitleMenus.some((menuItem) => "submenu" in menuItem),
      false
    );

    assert.ok(
      viewTitleMenus.some((menuItem) => menuItem.command === "directoryprovider/importbookmarks"),
      "Expected the view title overflow menu to contain the import command."
    );
    assert.ok(
      viewTitleMenus.some((menuItem) => menuItem.command === "directoryprovider/exportbookmarks"),
      "Expected the view title overflow menu to contain the export command."
    );
  });
});
