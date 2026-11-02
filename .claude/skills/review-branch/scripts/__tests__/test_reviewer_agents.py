"""Every branch reviewer agent is set up for review-branch file mode."""

from __future__ import annotations

from pathlib import Path
import unittest


class ReviewerAgentsBehaviour(unittest.TestCase):
    def test_given_branch_reviewers_then_each_can_write_its_findings_file_and_cites_the_contract(self) -> None:
        reviewers = [path for path in AGENTS_DIR.glob("*-review.md") if not path.name.startswith("plan-review-")]

        self.assertGreater(len(reviewers), 0)
        for path in reviewers:
            with self.subTest(path.name):
                self.assertIn("Write", tools_of(path))
                self.assertIn(CONTRACT, path.read_text(encoding="utf-8"))

    def test_given_branch_reviewers_then_each_says_to_hand_back_only_the_status_line_in_file_mode(self) -> None:
        reviewers = [path for path in AGENTS_DIR.glob("*-review.md") if not path.name.startswith("plan-review-")]

        self.assertGreater(len(reviewers), 0)
        for path in reviewers:
            with self.subTest(path.name):
                body = path.read_text(encoding="utf-8")
                self.assertIn("`Findings file:`", body)
                self.assertIn("hand back only its one-line status", body)

    def test_given_plan_critics_then_they_stay_read_only(self) -> None:
        critics = list(AGENTS_DIR.glob("plan-review-*.md"))

        self.assertGreater(len(critics), 0)
        for path in critics:
            with self.subTest(path.name):
                self.assertNotIn("Write", tools_of(path))

    def test_given_reviewer_roster_then_domain_and_arch_run_on_sonnet_and_security_and_correctness_on_opus(self) -> None:
        models = {name: model_of(AGENTS_DIR / f"{name}.md") for name in EXPECTED_MODELS}

        self.assertEqual(models, EXPECTED_MODELS)

    def test_given_reviewers_without_skills_then_none_can_preload_load_or_invoke_a_skill(self) -> None:
        for name in SKILL_FREE_REVIEWERS:
            with self.subTest(name):
                path = AGENTS_DIR / f"{name}.md"
                body = path.read_text(encoding="utf-8")
                self.assertNotIn("Skill", tools_of(path))
                self.assertFalse(any(line.startswith("skills:") for line in frontmatter_of(body)))
                self.assertEqual([reference for reference in FORBIDDEN_SKILL_REFERENCES if reference in body], [])


def tools_of(path: Path) -> list[str]:
    line = next(line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("tools:"))
    return [tool.strip() for tool in line.removeprefix("tools:").split(",")]


def model_of(path: Path) -> str:
    line = next(line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("model:"))
    return line.removeprefix("model:").strip()


def frontmatter_of(body: str) -> list[str]:
    return body.split("---", 2)[1].splitlines()


AGENTS_DIR = Path(__file__).resolve().parents[4] / "agents"
CONTRACT = "review-agent-output-contract.md"
EXPECTED_MODELS = {
    "domain-review": "sonnet",
    "arch-review": "sonnet",
    "security-review": "opus",
    "correctness-review": "opus",
}
SKILL_FREE_REVIEWERS = ("domain-review", "test-review", "test-smell-review")
FORBIDDEN_SKILL_REFERENCES = (
    "SKILL.md",
    "../skills/",
    "ubiquitous-language",
    "feature-file-validation",
    "test-design-advisor",
    "farley-score",
    "test-health",
)


if __name__ == "__main__":
    unittest.main()
