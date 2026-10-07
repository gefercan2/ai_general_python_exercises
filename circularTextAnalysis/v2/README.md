# Lexia — local text analysis with Ollama

Lexia is a Voyant-style reading and analysis tool that runs entirely on your computer. A small Python server does the heavy work (file parsing, topics, linguistics, memory) and a browser page shows the results. Local language models, run through Ollama, only name topics, describe characters and write short comments.

## What is in the folder

`run.py` is the server. `lexia_memory.py` is the optional memory add-on. `index.html` is the interface, with `llm.js`, `nlp.js` and `memory.js` as its add-on scripts. `start.bat` (Windows) and `start.command` (Mac/Linux) are the double-click launchers. `requirements.txt` lists the Python packages. Keep every file in the same folder. The folder can live on any drive; the Python packages install into Python's own folder.

## What you need

- **Python 3.9 or newer** (required), from python.org.
- **Ollama** (ollama.com) for the model features. Lexia still opens without it.
- **pypdf, python-docx, scikit-learn, spaCy** (optional but recommended): PDF and Word files, topic clusters, lemmas and character names. numpy is optional and speeds up similarity search.
- An internet connection the first time you open the page, because it loads the D3 charting library from a CDN.

Lexia switches off only the features whose package is missing. The status line under the file list in the ingest panel shows ✓ or ✗ for each.

---

## Windows

Use Command Prompt or PowerShell, opened in the Lexia folder (type `cmd` in the folder's address bar).

**1. Install Python.** On the first installer screen tick **Add Python to PATH**. Check with `python --version`.

**2. Install the packages.**

```
python -m pip install -r requirements.txt
```

**If this fails with `CERTIFICATE_VERIFY_FAILED ... self signed certificate in certificate chain`** (typical when an antivirus scans HTTPS traffic or you are behind a company proxy), the connection to PyPI is being re-signed with a certificate Python does not trust. Install `pip-system-certs` once, skipping the check for that single command only. It makes pip use Windows' own certificate store, where that certificate is normally already trusted:

```
python -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org pip-system-certs
python -m pip install -r requirements.txt
```

Use the bypass only on a network you trust. On a work network, ask IT for the company certificate instead. As alternatives, pause your antivirus's "HTTPS scanning" while you install, or add the `--trusted-host` flags to any single `pip install` command.

**3. Check what is installed.**

```
python -m pip list | findstr /i "pypdf docx scikit spacy numpy"
```

In PowerShell use `Select-String -Pattern "pypdf|python-docx|scikit-learn|spacy|numpy"` instead of `findstr`. You should see all five names with version numbers.

**4. Download a spaCy language model.**

```
python -m spacy download en_core_web_sm
```

Other languages: `es_core_news_sm`, `fr_core_news_sm`, `de_core_news_sm`. Confirm with `python -m spacy info`.

**5. Download the Ollama models.**

```
ollama pull llama3.1:8b
ollama pull deepseek-r1:7b
ollama pull nomic-embed-text
```

Run `ollama list` and compare the names with the `LLM_MODELS` list at the top of `llm.js`. The tags must match exactly (the file says `gemma2:12b`, so edit it if yours is named differently).

**6. Start Lexia.** Make sure Ollama is running, then double-click `start.bat` or run `python run.py`. Your browser opens at `http://localhost:8000`. To use another port: `set LEXIA_PORT=8001` before starting.

---

## Mac / Linux

Use Terminal, opened in the Lexia folder.

**1. Install Python.** Mac: python.org or `brew install python`. Linux: `sudo apt install python3 python3-pip` (or your distribution's equivalent). Check with `python3 --version`.

**2. Install the packages.**

```
python3 -m pip install -r requirements.txt
```

On Linux an "externally managed environment" error means you should add `--break-system-packages`, or use a virtual environment (`python3 -m venv .venv && source .venv/bin/activate`).

**If this fails with a certificate error** (`CERTIFICATE_VERIFY_FAILED`, often caused by a company proxy or security software), skip the check for the PyPI hosts on that one command and install `pip-system-certs`, so later installs use the system certificates:

```
python3 -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org pip-system-certs
python3 -m pip install -r requirements.txt
```

On macOS with the python.org installer, you can also run `/Applications/Python 3.x/Install Certificates.command` once, which fixes the most common certificate error. As on Windows, use the bypass only on a network you trust.

**3. Check what is installed.**

```
python3 -m pip list | grep -i -E "pypdf|python-docx|scikit-learn|spacy|numpy"
```

**4. Download a spaCy language model.**

```
python3 -m spacy download en_core_web_sm
```

**5. Download the Ollama models.**

```
ollama pull llama3.1:8b
ollama pull deepseek-r1:7b
ollama pull nomic-embed-text
```

Then run `ollama list` and make the names match `LLM_MODELS` in `llm.js`, as above.

**6. Start Lexia.** Make sure Ollama is running. On Mac, run `chmod +x start.command` once, then double-click it. On Linux or from Terminal run `./start.command` or `python3 run.py`. Your browser opens at `http://localhost:8000`. To use another port: `LEXIA_PORT=8001 python3 run.py`.

---

## Using Lexia

1. **Ingest:** drop or browse for `.txt`, `.md`, `.csv`, `.pdf`, `.docx` or `.html` files, or paste text.
2. **Choose analysis:** pick *single text* (all files merged into one chart) or *compare* (one ring per file). With several files, click the circles in the network graph to choose which to include. Choose *generic topics* or *characters / personas* for novels and historical works.
3. **Set the depth:** use the quick-to-deeper slider to pick the model. Adjust top words, collocate window and the memory options if needed.
4. **Create chart.** The rings show topics and the word dial in the centre, then paragraphs, word occurrences and citations. Click a paragraph to open it. The red dot marks the paragraph you selected. Click a word or topic to highlight it everywhere.
5. **Read and annotate:** "see text complete" opens the full reader. Select text, press *annotate*, write a note or press *suggest* for a model draft, then save. Export annotations and specs from the side panel to your disk.

## Troubleshooting

- A file list appears instead of the app: `index.html` is missing or in another folder.
- "Ollama is not running": start Ollama, then reload the page.
- Features show ✗ in the status line: install the matching package from your platform's step 2 or 4.
- `grep` or `Select-String` "is not recognized": you are in the other shell. Use `findstr` in Command Prompt, `Select-String` in PowerShell, `grep` on Mac/Linux.
- Your data is stored in `lexia_data/lexia.db`. Delete that file to reset everything.
- Privacy: your texts never leave your computer; the only online request is the D3 library download.
