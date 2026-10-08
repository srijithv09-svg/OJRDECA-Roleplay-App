"""Independently verify the pinned corpus with pdfplumber (not the app's PDF parser).

Usage: python scripts/verify-answer-key-baseline.py [folder]
Requires pdfplumber. Reads local PDFs only and never changes the baseline or database.
"""

from concurrent.futures import ProcessPoolExecutor, as_completed
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

import pdfplumber


def read_key(file):
    answers = []
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if not re.search(r"EXAM\s*[—–-]\s*KEY", text):
                continue
            for number, answer in re.findall(
                r"^\s*((?:\d[ \t]*){1,3})[.)]\s*([A-E])\b", text, re.M
            ):
                answers.append((int(re.sub(r"\s+", "", number)), answer))
    answers.sort()
    assert [number for number, _ in answers] == list(range(1, 101)), str(file)
    return sha256("".join(answer for _, answer in answers).encode()).hexdigest()


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "import_data/raw_pdfs")
    baseline = json.loads((Path(__file__).parent / "fixtures/exam-key-corpus.json").read_text())["exams"]
    paths = {}
    for file in sorted(root.rglob("*.pdf")):
        if "exam" not in file.name.lower() or "blueprint" in file.name.lower():
            continue
        pdf_hash = sha256(file.read_bytes()).hexdigest()
        assert pdf_hash in baseline, f"Unverified PDF: {file}"
        paths.setdefault(pdf_hash, file)
    assert paths, "No exam PDFs found"
    with ProcessPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(read_key, file): pdf_hash for pdf_hash, file in paths.items()}
        for task in as_completed(tasks):
            pdf_hash = tasks[task]
            assert task.result() == baseline[pdf_hash]["answer_sha256"], str(paths[pdf_hash])
    print(f"Independent pdfplumber verification passed for {len(paths)} distinct PDFs.")


if __name__ == "__main__":
    main()
