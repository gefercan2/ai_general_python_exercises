# AI Virtual Environment — Setup Guide

A step-by-step guide to setting up a well-organised Python virtual environment for AI work, with three clearly separated sections (General AI, LLM, and Docling) that all share common heavy libraries like PyTorch — avoiding redundancy.

---

## How the setup is structured

Before touching the terminal, here is the mental model. You have one project folder (`ai-learning/`) that contains three things side by side:

```
ai-learning/              ← your project root, you always work from here
├── ai-base/              ← the virtual environment (auto-generated, never edit inside)
├── requirements/         ← your dependency files, one per section
│   ├── base.txt          ← shared heavy libraries (PyTorch, NumPy, etc.)
│   ├── general_ai.txt    ← General AI extras, references base.txt
│   ├── llm.txt           ← LLM extras, references base.txt
│   └── docling.txt       ← Docling extras, references base.txt
└── notebooks/            ← your Jupyter notebooks, one per section
    ├── general_ai.ipynb
    ├── llm.ipynb
    └── docling.ipynb
```

**Why this structure avoids redundancy:** Each section file starts with `-r base.txt`, which tells pip "include everything from base.txt first". So PyTorch and the other shared libraries are defined once and reused by all three sections — never installed twice.

---

## Part 1 — Create the virtual environment

A virtual environment is an isolated Python installation just for your project. It keeps your project's packages separate from the rest of your system.

**Step 1 — Create the project folder and move into it:**

```bash
mkdir ai-learning
cd ai-learning
```

**Step 2 — Create the virtual environment inside it:**

```bash
python -m venv ai-base
```

This creates the `ai-base/` folder. Python manages everything inside it — you never need to open or edit it manually.

**Step 3 — Activate the virtual environment:**

```bash
# macOS / Linux:
source ai-base/bin/activate

# Windows:
ai-base\Scripts\activate
```

You will know it is active because your terminal prompt changes to show `(ai-base)` at the start. Every `pip install` command you run while it is active goes into this environment, not your system Python.

**Step 4 — Upgrade pip:**

```bash
pip install --upgrade pip
```

---

## Part 2 — Create the requirements files

Requirements files are plain text files that list the packages you want pip to install. You are going to create one folder with four files inside it.

**Step 5 — Create the requirements folder:**

```bash
mkdir requirements
```

**Step 6 — Create `base.txt` — the shared heavy libraries:**

```bash
cat > requirements/base.txt << 'EOF'
torch
torchvision
numpy
scipy
matplotlib
tqdm
pydantic
accelerate
EOF
```

**Step 7 — Create `general_ai.txt`:**

```bash
cat > requirements/general_ai.txt << 'EOF'
-r base.txt
scikit-learn
opencv-python
datasets
gymnasium
EOF
```

The `-r base.txt` line means "include base.txt first". This is how sharing works — pip reads base.txt automatically when you install from this file.

**Step 8 — Create `llm.txt`:**

```bash
cat > requirements/llm.txt << 'EOF'
-r base.txt
transformers
langchain
langchain-community
llama-index
tiktoken
sentence-transformers
EOF
```

**Step 9 — Create `docling.txt`:**

```bash
cat > requirements/docling.txt << 'EOF'
-r base.txt
docling
pypdf
pillow
python-docx
easyocr
EOF
```

**Step 10 — Verify the files were created correctly:**

```bash
ls requirements/
```

You should see: `base.txt   docling.txt   general_ai.txt   llm.txt`

Spot-check the content of one file:

```bash
cat requirements/base.txt
```

---

## Part 3 — Install the packages

Now you tell pip to read your requirements files and install everything.

**Step 11 — Install all sections at once (recommended for a dev machine):**

```bash
pip install -r requirements/general_ai.txt \
            -r requirements/llm.txt \
            -r requirements/docling.txt
```

Because each file references `base.txt`, pip resolves it once and installs PyTorch only once — no duplication.

Or install just one section if you want to keep things light for now:

```bash
# Just Docling:
pip install -r requirements/docling.txt

# Just LLM:
pip install -r requirements/llm.txt
```

---

## Part 4 — Set up Jupyter notebooks

Jupyter lets you run Python code interactively in the browser, in chunks called cells. This is the standard way to do AI and ML work.

**Step 12 — Install Jupyter (venv must be active):**

Make sure you are still in `ai-learning/` and your prompt shows `(ai-base)`, then run:

```bash
pip install jupyter ipykernel
```

**Step 13 — Create the notebooks folder and your first notebooks:**

```bash
mkdir notebooks
touch notebooks/general_ai.ipynb
touch notebooks/llm.ipynb
touch notebooks/docling.ipynb
```

**Step 14 — Launch Jupyter:**

```bash
jupyter notebook
```

This opens a browser window showing your project folder. Navigate to `notebooks/` and click any file to open it. Because your venv is active, Jupyter automatically uses all the packages you installed.

---

## Part 5 — Connecting each notebook to its requirements

At the top of each notebook, add a code cell that installs that section's specific packages. Run this cell once the first time you open the notebook — after that you can skip it.

**In `general_ai.ipynb` — first cell:**

```python
import subprocess
subprocess.run(["pip", "install", "-r", "../requirements/general_ai.txt"])
```

**In `llm.ipynb` — first cell:**

```python
import subprocess
subprocess.run(["pip", "install", "-r", "../requirements/llm.txt"])
```

**In `docling.ipynb` — first cell:**

```python
import subprocess
subprocess.run(["pip", "install", "-r", "../requirements/docling.txt"])
```

The `../` means "go up one folder from `notebooks/` to reach `requirements/`".

---

## Part 6 — Your daily workflow

Every time you come back to work on this project, you only need three commands:

```bash
cd ai-learning                      # 1. go to your project folder
source ai-base/bin/activate         # 2. activate the venv (macOS/Linux)
# ai-base\Scripts\activate          #    or this on Windows
jupyter notebook                    # 3. launch Jupyter
```

Then open the notebook for the section you are working in.

---

## Quick reference — what each section contains

| Section | File | Key packages |
|---|---|---|
| Shared base | `base.txt` | torch, torchvision, numpy, scipy, matplotlib |
| General AI | `general_ai.txt` | scikit-learn, opencv-python, datasets, gymnasium |
| LLM | `llm.txt` | transformers, langchain, llama-index, tiktoken |
| Docling | `docling.txt` | docling, pypdf, pillow, python-docx, easyocr |

---

## Bonus — using `uv` for faster installs

`uv` is a modern, faster replacement for pip. It caches wheels globally so PyTorch is only downloaded once across all your projects, even if you create new environments later.

```bash
pip install uv
uv venv ai-base
source ai-base/bin/activate
uv pip install -r requirements/llm.txt
```

Everything else stays exactly the same — `uv pip install` is a drop-in replacement for `pip install`.

---

## Appendix — the two research pipeline workflows

This environment was designed to support two document processing pipelines:

**Workflow 1 — Raw PDFs → Zotero → Docling → Claude Code**

1. Import PDFs into Zotero via the browser plugin or drag-and-drop. Zotero auto-fetches metadata and exports BibTeX.
2. Export PDFs from Zotero to a local folder.
3. Run Docling to parse PDFs — it handles OCR, table extraction, and outputs clean markdown or JSON.
4. Feed the structured output to Claude Code for summarisation, Q&A, synthesis, or citation generation.

**Workflow 2 — Google Drive → Docling → Claude Code**

1. Pull files from Google Drive using the Drive API, `rclone`, or manual export.
2. Run Docling — it handles `.docx`, `.pptx`, `.html`, and PDF, normalising everything to the same markdown or JSON format.
3. Feed the output to Claude Code exactly as in Workflow 1.

Docling is the key bridge in both cases: it solves the "messy document → machine-readable text" problem reliably, preserving table structure, reading order, and headings.
