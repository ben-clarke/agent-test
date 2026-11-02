"""Behaviour of the review panel resolver, run through its CLI."""

from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import select_lenses  # noqa: E402


class SelectLensesBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def resolve(self, *files: str, root: Path | None = None) -> dict:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            select_lenses.main(["--root", str(root or self.root), "--files", *files])
        output = json.loads(stdout.getvalue())
        self.assertEqual(set(output), OUTPUT_KEYS)
        return output

    def write_agent(self, name: str, scope: str, model: str | None = None) -> None:
        model_line = f"model: {model}\n" if model else ""
        path = self.root / ".claude" / "agents" / f"{name}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\n{model_line}---\n\nScope: {scope}\n", encoding="utf-8")

    def write_manifest(self, directory: str) -> None:
        path = self.root / directory / "package.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"scripts": {"test": "vitest"}}\n', encoding="utf-8")


class CheapFirstOrdering(SelectLensesBehaviour):
    def test_given_a_change_across_two_apps_and_a_test_when_resolved_then_every_cheaper_reviewer_precedes_every_opus_reviewer(self) -> None:
        # Given
        files = (
            "src/js/apps/ui-dashboard/app/a.ts",
            "src/js/apps/testing-api/src/b.ts",
            "src/js/apps/ui-dashboard/app/__tests__/a.test.ts",
        )

        # When
        lenses = self.resolve(*files, root=REPO_ROOT)["lenses"]

        # Then
        opus_positions = [index for index, name in enumerate(lenses) if runs_on_opus(name)]
        cheaper_positions = [index for index, name in enumerate(lenses) if not runs_on_opus(name)]
        self.assertTrue(opus_positions)
        self.assertLess(max(cheaper_positions), min(opus_positions))
        self.assertLess(lenses.index("domain-review"), lenses.index("security-review"))
        self.assertLess(lenses.index("domain-review"), lenses.index("correctness-review"))
        self.assertLess(lenses.index("arch-review"), lenses.index("security-review"))
        self.assertLess(lenses.index("arch-review"), lenses.index("correctness-review"))

    def test_given_a_reviewer_naming_no_model_when_resolved_then_it_is_listed_before_an_opus_reviewer(self) -> None:
        # Given
        self.write_agent("alpha-review", "always", model="opus")
        self.write_agent("beta-review", "always")

        # When
        lenses = self.resolve("src/js/apps/one/a.ts")["lenses"]

        # Then
        self.assertEqual(lenses, ["beta-review", "alpha-review"])


class FeatureFileSelection(SelectLensesBehaviour):
    def test_given_a_feature_file_only_change_when_resolved_then_test_smell_review_is_selected(self) -> None:
        # Given
        feature_file = "src/js/apps/ui-dashboard/tests/x.feature"

        # When
        lenses = self.resolve(feature_file, root=REPO_ROOT)["lenses"]

        # Then
        self.assertIn("test-smell-review", lenses)


class CrossPackageArchitectureReview(SelectLensesBehaviour):
    def setUp(self) -> None:
        super().setUp()
        self.write_agent("arch-review", "cross-package")
        for directory in ("", "src/js/apps/one", "src/js/apps/two"):
            self.write_manifest(directory)

    def test_given_a_change_spanning_two_apps_when_resolved_then_arch_review_is_selected(self) -> None:
        # Given
        files = ("src/js/apps/one/app/a.ts", "src/js/apps/two/src/b.ts")

        # When
        output = self.resolve(*files)

        # Then
        self.assertEqual(output, {"lenses": ["arch-review"], "warnings": []})

    def test_given_one_app_and_shared_ground_including_any_package_json_edit_when_resolved_then_arch_review_is_selected(self) -> None:
        for shared_file in SHARED_GROUND_FILES:
            with self.subTest(shared_file):
                # When
                output = self.resolve("src/js/apps/one/app/a.ts", shared_file)

                # Then
                self.assertEqual(output, {"lenses": ["arch-review"], "warnings": []})

    def test_given_several_files_inside_one_app_when_resolved_then_arch_review_is_skipped_as_not_cross_package(self) -> None:
        # Given
        files = ("src/js/apps/one/app/a.ts", "src/js/apps/one/app/b.tsx", "src/js/apps/one/app/__tests__/a.test.ts")

        # When
        output = self.resolve(*files)

        # Then
        self.assertEqual(output, {"lenses": [], "warnings": [NOT_CROSS_PACKAGE_WARNING]})

    def test_given_only_an_adr_and_agent_configuration_when_resolved_then_arch_review_is_skipped_as_not_cross_package(self) -> None:
        # When
        output = self.resolve("docs/adr/0001-x.md", ".claude/agents/x.md")

        # Then
        self.assertEqual(output, {"lenses": [], "warnings": [NOT_CROSS_PACKAGE_WARNING]})

    def test_given_one_app_and_a_root_readme_when_resolved_then_arch_review_is_not_selected(self) -> None:
        # When
        output = self.resolve("src/js/apps/one/app/a.ts", "README.md")

        # Then
        self.assertNotIn("arch-review", output["lenses"])

    def test_given_look_alike_names_when_resolved_then_they_do_not_count_as_shared_ground(self) -> None:
        # When
        output = self.resolve("src/js/apps/one/app/my-packages.ts", "infra-docs/x.md")

        # Then
        self.assertNotIn("arch-review", output["lenses"])

    def test_given_a_deleted_app_manifest_and_a_change_in_another_app_when_resolved_then_arch_review_is_selected(self) -> None:
        # Given
        (self.root / "src/js/apps/one/package.json").unlink()

        # When
        output = self.resolve("src/js/apps/one/package.json", "src/js/apps/two/src/x.ts")

        # Then
        self.assertIn("arch-review", output["lenses"])

    def test_given_a_lockfile_only_change_when_resolved_then_arch_review_is_not_selected(self) -> None:
        # When
        output = self.resolve("pnpm-lock.yaml")

        # Then
        self.assertNotIn("arch-review", output["lenses"])

    def test_given_no_way_to_look_up_packages_when_resolved_for_one_app_then_arch_review_is_kept_unnarrowed(self) -> None:
        # Given
        roster = [("arch-review", select_lenses.SCOPE_CROSS_PACKAGE, False)]

        # When
        lenses, warnings = select_lenses.applicable_lenses(["src/js/apps/one/app/a.ts"], roster)

        # Then
        self.assertEqual((lenses, warnings), (["arch-review"], ["unnarrowed-cross-package:arch-review"]))

    def test_given_an_arch_review_definition_without_a_scope_when_resolved_for_one_app_then_it_fails_open(self) -> None:
        # Given
        (self.root / ".claude/agents/arch-review.md").write_text("---\nname: arch-review\n---\n", encoding="utf-8")

        # When
        output = self.resolve("src/js/apps/one/app/a.ts")

        # Then
        self.assertEqual(output, {"lenses": ["arch-review"], "warnings": ["arch-review"]})

    def test_given_no_changed_files_when_resolved_then_no_reviewer_is_selected(self) -> None:
        # When
        output = self.resolve()

        # Then
        self.assertEqual(output, {"lenses": [], "warnings": []})


class ArchitectureReviewOnTheRealRoster(SelectLensesBehaviour):
    def test_given_a_single_app_change_like_cl_2335_when_resolved_then_arch_review_is_skipped_as_not_cross_package(self) -> None:
        # Given
        files = (
            "src/js/apps/ui-dashboard/app/routes/a.tsx",
            "src/js/apps/ui-dashboard/app/lib/b.server.ts",
            "src/js/apps/ui-dashboard/app/lib/__tests__/b.server.test.ts",
        )

        # When
        output = self.resolve(*files, root=REPO_ROOT)

        # Then
        self.assertNotIn("arch-review", output["lenses"])
        self.assertIn(NOT_CROSS_PACKAGE_WARNING, output["warnings"])

    def test_given_a_change_across_two_apps_when_resolved_then_arch_review_is_selected(self) -> None:
        # When
        output = self.resolve("src/js/apps/ui-dashboard/app/a.ts", "src/js/apps/testing-api/src/b.ts", root=REPO_ROOT)

        # Then
        self.assertIn("arch-review", output["lenses"])


def runs_on_opus(name: str) -> bool:
    text = (REPO_ROOT / ".claude" / "agents" / f"{name}.md").read_text(encoding="utf-8")
    model_line = next(line for line in text.splitlines() if line.startswith("model:"))
    return "opus" in model_line


REPO_ROOT = Path(__file__).resolve().parents[5]
OUTPUT_KEYS = {"lenses", "warnings"}
NOT_CROSS_PACKAGE_WARNING = "skipped-not-cross-package:arch-review"
SHARED_GROUND_FILES = (
    "src/js/packages/shared/src/index.ts",
    "infra/main.tf",
    "src/js/apps/one/package.json",
    "package.json",
)


if __name__ == "__main__":
    unittest.main()
