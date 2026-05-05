# Unified Local AI System

You need to launch it from terminal
via port 8888
the models are slow but is mainly for learning purposes
A fully local AI-powered document analysis and Q&A system that runs entirely on your machine. No cloud, no API keys, no data leaving your computer.

## Features

### 📁 File Management
- Upload and manage documents (txt, md, csv, pdf, docx)
- Automatic indexing into local vector database
- Batch operations for multiple files
- Real-time status tracking

### 📖 Text Analysis (Voyant-style)
- Word frequency analysis with interactive charts
- Word clouds with customizable parameters
- Keywords in Context (KWIC) search
- Corpus statistics (vocabulary diversity, sentence length, etc.)
- N-gram analysis (bigrams, trigrams)
- Multi-language stopword support (English, French, Spanish, German, Italian)

### 🤖 AI-Powered Q&A
- Four query modes for different use cases:
  - **Mode 1**: SmolLM only (fast general questions)
  - **Mode 2**: Qwen only (code and multilingual)
  - **Mode 3**: Full pipeline (routing, critique, retry)
  - **Mode 4**: TinyLlama only (fastest)
- RAG (Retrieval-Augmented Generation) using your documents
- Correction memory with semantic matching
- Automatic answer quality critique with retry
- Complete execution tracking

## System Requirements

### Hardware
- **Minimum**: 8GB RAM, 10GB free disk space
- **Recommended**: 16GB RAM, 20GB free disk space
- **GPU**: Optional (runs on CPU, GPU accelerates if available)

### Software
- **Python**: 3.8 or higher
- **Ollama**: Latest version
- **Operating System**: Windows, macOS, or Linux

## Installation

### 1. Install Ollama

Download and install Ollama from [https://ollama.ai](https://ollama.ai)

### 2. Pull Required Models

```bash
ollama pull smollm2:1.7b
ollama pull qwen2.5:1.5b
ollama pull tinyllama:1.1b
```

### 3. Clone or Download This Project

```bash
git clone <your-repo-url>
cd unified-local-ai
```

Or download and extract the ZIP file.

### 4. Install Python Dependencies

#### Option A: Automatic (Recommended)

Just run the launcher - it will create the virtual environment and install dependencies automatically:

**Windows:**
```bash
launch.bat
```

**macOS/Linux:**
```bash
chmod +x launch.sh
./launch.sh
```

#### Option B: Manual

```bash
# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Quick Start (One-Click Launch)

**Windows:** Double-click `launch.bat`

**macOS/Linux:** 
```bash
chmod +x launch.sh
./launch.sh
```

This will:
1. Check if Ollama is running (start it if needed)
2. Create/activate virtual environment
3. Install dependencies if needed
4. Launch the Streamlit application
5. Open your browser automatically

### Manual Start

If you prefer to run components separately:

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Activate venv and run app
source venv/bin/activate  # or venv\Scripts\activate on Windows
streamlit run app.py
```

### Using the Application

1. **Upload Documents** (File Manager tab)
   - Click "Choose files to upload"
   - Select your documents
   - Click "Upload & Index Files"
   - Files are automatically indexed for RAG

2. **Analyze Text** (Text Analysis tab)
   - Select a file from the dropdown
   - View statistics, word frequencies, word cloud
   - Search for keywords in context (KWIC)
   - Explore bigrams and word length distribution

3. **Ask Questions** (AI Query tab)
   - Configure query mode in sidebar
   - Enable/disable RAG and correction memory
   - Type your question
   - Click "Ask"
   - View answer with sources and metadata
   - Correct wrong answers to improve future responses

## Configuration

### Changing Models

Edit `core/config.py`:

```python
OLLAMA_MODELS = {
    "smollm": "smollm2:1.7b",
    "qwen": "qwen2.5:1.5b",
    "tinyllama": "tinyllama:1.1b"
}
```

### Adjusting Performance

For older hardware, reduce token limits in `core/config.py`:

```python
MAX_TOKENS = {
    "smollm": 200,      # Reduce from 300
    "qwen": 200,        # Reduce from 300
    "tinyllama": 150    # Reduce from 200
}

CHUNK_SIZE = 400        # Reduce from 500
RAG_TOP_K = 2          # Reduce from 3
```

### Changing Ports

Edit `launcher.py`:

```python
STREAMLIT_PORT = 8501  # Change to your preferred port
```

## Project Structure

```
unified-local-ai/
├── app.py                      # Main Streamlit application
├── launcher.py                 # Python launcher script
├── launch.bat                  # Windows launcher
├── launch.sh                   # macOS/Linux launcher
├── requirements.txt            # Python dependencies
├── .gitignore                  # Git ignore rules
│
├── core/                       # Foundation layer
│   ├── config.py              # Centralized configuration
│   ├── models.py              # Model management
│   ├── embeddings.py          # Embedding generation
│   └── __init__.py
│
├── services/                   # Persistent services
│   ├── vector_store.py        # ChromaDB RAG
│   ├── correction_memory.py   # Verified answers
│   └── __init__.py
│
├── modules/                    # Application modules
│   ├── file_manager.py        # File operations
│   ├── text_analysis.py       # Voyant-style analysis
│   ├── ai_pipeline.py         # Query orchestration
│   └── __init__.py
│
├── my_documents/              # Your files (gitignored)
├── my_vector_db/              # ChromaDB index (gitignored)
└── corrections.json           # Saved corrections (gitignored)
```

## Troubleshooting

### Ollama Not Found

**Error:** `Ollama is not running`

**Solution:**
```bash
# Check if Ollama is installed
ollama --version

# If not installed, download from https://ollama.ai

# Start Ollama
ollama serve
```

### Model Not Found

**Error:** `Model not found: smollm2:1.7b`

**Solution:**
```bash
ollama pull smollm2:1.7b
ollama pull qwen2.5:1.5b
ollama pull tinyllama:1.1b
```

### Virtual Environment Issues

**Error:** `Virtual environment not found`

**Solution:**
```bash
# Delete existing venv if corrupted
rm -rf venv

# Create fresh environment
python -m venv venv

# Activate and install
source venv/bin/activate  # or venv\Scripts\activate
pip install -r requirements.txt
```

### Port Already in Use

**Error:** `Port 8501 is already in use`

**Solution:**
```bash
# Find and kill the process (Linux/macOS)
lsof -ti:8501 | xargs kill -9

# Or change the port in launcher.py
STREAMLIT_PORT = 8502
```

### Out of Memory

**Error:** Models crash or system becomes unresponsive

**Solution:**
1. Close other applications
2. Use Mode 4 (TinyLlama only) - fastest, lowest memory
3. Reduce `MAX_TOKENS` and `CHUNK_SIZE` in config.py
4. Index fewer documents at a time

### Slow Performance

**Symptoms:** Queries take 30+ seconds

**Solutions:**
- Use Mode 4 for simple questions
- Disable RAG for general knowledge questions
- Reduce `RAG_TOP_K` to 2 or 1
- Check if Ollama is using CPU instead of GPU
- Close other applications to free RAM

## Advanced Usage

### Testing Individual Modules

Each module can be tested independently:

```bash
# Test configuration
python core/config.py

# Test models
python core/models.py

# Test embeddings
python core/embeddings.py

# Test vector store
python services/vector_store.py

# Test correction memory
python services/correction_memory.py

# Test file manager
python modules/file_manager.py

# Test text analysis
python modules/text_analysis.py

# Test AI pipeline
python modules/ai_pipeline.py
```

### Programmatic Usage

You can import and use modules in your own scripts:

```python
from modules import create_file_manager, create_pipeline, QueryMode

# File management
fm = create_file_manager()
fm.index_all_files()

# Query pipeline
pipeline = create_pipeline(mode=QueryMode.FULL_PIPELINE)
result = pipeline.query("What is machine learning?")
print(result.answer)
```

### Exporting Corrections

```python
from services import create_correction_memory

memory = create_correction_memory()
memory.export_corrections(Path("my_corrections.txt"))
```

### Batch Indexing

```python
from modules import create_file_manager

fm = create_file_manager()
result = fm.index_all_files()
print(f"Indexed {result['files_indexed']} files")
```

## Privacy & Data

- **All processing is local** - no data sent to external APIs
- **Your documents** are stored in `my_documents/` (gitignored)
- **Vector embeddings** are stored in `my_vector_db/` (gitignored)
- **Corrections** are saved in `corrections.json` (gitignored)
- **No telemetry** - Streamlit usage stats are disabled

To backup your data:
```bash
# Backup documents
cp -r my_documents/ backup/

# Backup vector database
cp -r my_vector_db/ backup/

# Backup corrections
cp corrections.json backup/
```

## Contributing

This is a personal project, but suggestions and improvements are welcome:

1. Test the system
2. Document any issues
3. Suggest improvements
4. Share your use cases

## License

[Your chosen license]

## Acknowledgments

- **Ollama** - Local LLM inference
- **LangChain** - LLM orchestration framework
- **ChromaDB** - Vector database
- **Sentence Transformers** - Embedding models
- **Streamlit** - Web interface
- **NLTK** - Text processing
- **Voyant Tools** - Inspiration for text analysis features

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Test individual modules
3. Check Ollama logs: `ollama logs`
4. Open an issue with detailed error messages

---

**Version:** 1.0.0  
**Last Updated:** 2024  
**Status:** Production Ready





# Unified Local AI System
## Complete Project Documentation

---

## SETUP SECTION

---

### Overview and Functioning Logic

The Unified Local AI System is a fully local, offline application that combines document management, text analysis, and AI-powered question answering into a single interface running entirely on personal hardware. The core design principle is that no data ever leaves the user's machine. There are no API keys, no cloud services, and no external dependencies beyond the initial installation of models and libraries.

The system operates on three distinct levels that work together. At the bottom level sits the inference layer, where language models run locally via Ollama, a tool that serves open-weight models through a local API on the same machine. Above that is a retrieval and memory layer that handles semantic search through documents and stores human-verified corrections. At the top is the application layer, which provides a browser-based interface through Streamlit and connects all the pieces into a coherent workflow.

When a user asks a question, the system follows a deliberate sequence designed to minimize how often it needs to call a language model, since inference on older hardware is slow. It first checks a correction memory store to see if a semantically similar question has been answered and corrected before. If a match is found above a similarity threshold of 0.85, the verified human answer is returned immediately without calling any model. If no memory hit occurs, the system retrieves the most relevant document chunks from the vector database using cosine similarity, injects them into the prompt as context, and then routes the question to the appropriate language model depending on the query type. After generating an answer, a lightweight critic model evaluates whether the answer actually addresses the question. If it fails, the system retries with a fallback model. This layered approach means that over time, as users correct wrong answers, the system becomes more accurate without any retraining.

The text analysis features operate completely independently of AI. Word frequencies, word clouds, keyword-in-context search, and corpus statistics all run in pure Python using NLTK and standard library tools. On old hardware this distinction matters enormously: these features return results instantly, while AI inference may take twenty to sixty seconds. Keeping the two paths separate means the system remains useful even when the AI layer is slow.

---

### Justification of the Stack

The technology choices were driven by three constraints: the system must run offline on old consumer hardware, it must handle unstructured document files of various formats, and it must be maintainable by a single person without enterprise infrastructure.

**Ollama** was chosen as the inference server because it abstracts away the complexity of running language models locally. It serves SmolLM2 (1.7B parameters), Qwen (1.8B), and TinyLlama (1.1B) through a consistent local HTTP API, handles model loading and memory management automatically, and works on CPU-only machines without requiring CUDA or a compatible GPU.

**LangChain** provides the orchestration layer that connects documents, embeddings, and models. Its document loaders handle the parsing of different file formats through a unified interface, its text splitter breaks documents into appropriately sized chunks, and its abstractions over embedding models make it possible to swap components without rewriting application logic.

**ChromaDB** was chosen over FAISS for the vector database because it persists data to disk by default and supports incremental document addition and deletion. FAISS is faster for one-time builds but requires rebuilding the entire index when documents change. Since this system is designed around a growing personal document repository, ChromaDB's ability to add and remove individual files without touching the rest of the index is the right trade-off.

**sentence-transformers** with the all-MiniLM-L6-v2 model handles all embedding generation. This model is small (around 80MB), fast on CPU, produces 384-dimensional vectors that are good enough for semantic similarity tasks, and runs independently of Ollama, which means embeddings work even if the LLM service is unavailable.

**Streamlit** was chosen for the interface because it allows a complete browser-based UI to be built in pure Python without any frontend development. Since the planned architecture calls for a custom GUI to be added later, Streamlit serves as a functional working interface during development without locking in any frontend decisions.

**NLTK** handles all text processing for the Voyant-style analysis features. Tokenization, sentence splitting, and stopword filtering are well-solved problems in NLTK and run instantly on any hardware. The wordcloud, matplotlib, and Plotly libraries handle visualization.

The three small Ollama models each serve a specific role. SmolLM2 is the default worker for general questions. Qwen handles code-related and multilingual queries. TinyLlama, being the lightest model, is used for the routing and critique roles where it runs twice per query but needs to produce only a short classification or evaluation, not a full answer. This division of labor keeps total memory usage under 8GB and ensures the cheapest possible model handles the highest-frequency operations.

---

### General Architecture

The system is organized into four layers: a foundation layer (core), a services layer, an application modules layer, and an entry point layer.

The foundation layer contains three files. Config.py holds all configuration in one place: directory paths, model names, chunk sizes, token limits, and thresholds. This means adjusting the system for different hardware requires changing only one file. Models.py manages loading and interacting with both Ollama models and the HuggingFace TinyLlama instance. Embeddings.py provides a singleton embedding manager that is shared across the entire application so the embedding model is loaded only once.

The services layer contains two files. Vector_store.py wraps ChromaDB and provides methods for adding document chunks, querying by semantic similarity, deleting by source, and managing the collection. Correction_memory.py manages the JSON file where human-verified corrections are stored with their embeddings, and provides semantic search over that store.

The application modules layer contains three files corresponding to the three main features. File_manager.py handles uploading files to the document repository and indexing them into the vector store. Text_analysis.py provides all Voyant-style analysis features in pure Python with no AI calls. Ai_pipeline.py orchestrates the full query flow: memory check, RAG retrieval, model routing, answer generation, critique, and retry.

The entry point layer contains the Streamlit application in app.py and the launcher scripts that start Ollama and Streamlit automatically.

---

### Workflow

The typical usage workflow follows three steps. First, the user uploads documents in the File Manager tab, where files are saved to the local repository and can then be indexed individually or in bulk. Indexing loads each file, splits it into 500-token chunks with 50-token overlap, generates embeddings for each chunk using sentence-transformers, and stores them in ChromaDB with source metadata. This is a one-time operation per file and the index persists between sessions.

Second, the user can select any uploaded file in the Text Analysis tab to get instant Voyant-style analysis: word frequency charts, word clouds, keyword-in-context search, corpus statistics, and bigram analysis. None of this requires AI and all results appear immediately.

Third, in the AI Query tab, the user asks questions in natural language. The system checks correction memory, retrieves relevant document chunks, selects and invokes the appropriate model, critiques the answer, and returns the result with source citations and execution metadata. If the answer is wrong, the user can type the correct answer directly in the interface, which saves it to correction memory and ensures future similar questions return the right answer.

---

### Architecture Diagram

```
User
  |
  v
[Launcher] (launcher.py / launch.bat / launch.sh)
  - Starts Ollama if not running
  - Activates virtual environment
  - Launches Streamlit on port 8888
  |
  v
[Streamlit Interface] (app.py)
  |
  |------ Tab 1: File Manager
  |         - Upload files to my_documents/
  |         - Index into ChromaDB
  |         - Manage (reindex, delete)
  |
  |------ Tab 2: Text Analysis
  |         - Word frequency (Plotly)
  |         - Word cloud (matplotlib)
  |         - KWIC (NLTK)
  |         - Statistics
  |         - Bigrams
  |
  |------ Tab 3: AI Query
            - Correction memory check
            - RAG retrieval
            - Model routing
            - Answer generation
            - Critique and retry
            - Correction interface
  |
  v
[Modules Layer]
  - file_manager.py    --> upload, parse, chunk, index
  - text_analysis.py   --> pure Python analysis
  - ai_pipeline.py     --> full query orchestration
  |
  v
[Services Layer]
  - vector_store.py        --> ChromaDB (RAG)
  - correction_memory.py   --> corrections.json (memory)
  |
  v
[Core Layer]
  - config.py      --> all settings
  - models.py      --> Ollama + HuggingFace
  - embeddings.py  --> sentence-transformers
  |
  v
[External Services]
  - Ollama server (smollm2:1.7b, qwen2.5:1.5b, tinyllama:1.1b)
  - ChromaDB (my_vector_db/)
  - FAISS optional fallback
  - my_documents/ (user file repository)
```

---

### Project File Structure

```
unified-local-ai/
|
|-- app.py                      Entry point - Streamlit application
|-- launcher.py                 Python launcher script
|-- launch.bat                  Windows double-click launcher
|-- launch.sh                   macOS/Linux double-click launcher
|-- requirements.txt            Python dependencies
|-- README.md                   Setup and usage guide
|-- .gitignore                  Excludes private data from git
|
|-- core/
|   |-- config.py               Centralized configuration
|   |-- models.py               Model management (Ollama + HuggingFace)
|   |-- embeddings.py           Embedding generation (singleton)
|   |-- __init__.py
|
|-- services/
|   |-- vector_store.py         ChromaDB wrapper for RAG
|   |-- correction_memory.py    Verified answer storage
|   |-- __init__.py
|
|-- modules/
|   |-- file_manager.py         File upload and indexing
|   |-- text_analysis.py        Voyant-style text analysis
|   |-- ai_pipeline.py          Query orchestration pipeline
|   |-- __init__.py
|
|-- my_documents/               User document repository (gitignored)
|-- my_vector_db/               ChromaDB index (gitignored)
|-- corrections.json            Saved corrections (gitignored)
```

---

### Requirements

```
ollama>=0.1.0
langchain>=0.1.0
langchain-community>=0.0.20
langchain-ollama>=0.0.1
langchain-text-splitters>=0.0.1
transformers>=4.36.0
torch>=2.1.0
accelerate>=0.25.0
sentence-transformers>=2.2.2
chromadb>=0.4.22
pypdf>=3.17.0
python-docx>=1.1.0
unstructured>=0.11.0
markdown>=3.5.0
nltk>=3.8.1
matplotlib>=3.8.0
plotly>=5.18.0
wordcloud>=1.9.3
streamlit>=1.29.0
numpy>=1.24.0
pandas>=2.1.0
```

---

### Installation

Install Ollama from https://ollama.ai, then pull the three models:

```
ollama pull smollm2:1.7b
ollama pull qwen2.5:1.5b
ollama pull tinyllama:1.1b
```

Create and activate a virtual environment:

```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Download NLTK data:

```
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"
```

Start the application:

```
streamlit run app.py --server.port=8888
```

Then open your browser to http://localhost:8888

---

### Source Files

---

#### core/config.py

```python
"""
Centralized configuration for the Unified Local AI System.
"""

from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DOCUMENTS_DIR = BASE_DIR / "my_documents"
VECTOR_DB_DIR = BASE_DIR / "my_vector_db"
CORRECTIONS_FILE = BASE_DIR / "corrections.json"

DOCUMENTS_DIR.mkdir(exist_ok=True)
VECTOR_DB_DIR.mkdir(exist_ok=True)

OLLAMA_MODELS = {
    "smollm": "smollm2:1.7b",
    "qwen": "qwen2.5:1.5b",
    "tinyllama": "tinyllama:1.1b"
}

HUGGINGFACE_MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

MODE_MODELS = {
    1: "smollm",
    2: "qwen",
    3: "smollm",
    4: "tinyllama"
}

FALLBACK_MAP = {
    "smollm": "qwen",
    "qwen": "smollm",
    "tinyllama": "smollm"
}

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
RAG_TOP_K = 3
RAG_SIMILARITY_THRESHOLD = 0.3
MEMORY_SIMILARITY_THRESHOLD = 0.85
MAX_CORRECTIONS = 1000

MAX_TOKENS = {
    "smollm": 300,
    "qwen": 300,
    "tinyllama": 200
}

TEMPERATURE = 0.2
CONTEXT_WINDOW = 2048

STOPWORD_LANGUAGES = ["english", "french", "spanish", "german", "italian"]
DEFAULT_STOPWORD_LANG = "english"
WORD_FREQ_TOP_N = 30
WORDCLOUD_WIDTH = 800
WORDCLOUD_HEIGHT = 400
WORDCLOUD_BACKGROUND = "white"
KWIC_MAX_RESULTS = 20

MAX_RETRIES = 2
CRITIQUE_PASS_KEYWORDS = ["yes", "answers", "clear", "relevant"]
CRITIQUE_FAIL_KEYWORDS = ["no", "does not", "unclear", "irrelevant", "off-topic"]

PAGE_TITLE = "Unified Local AI System"
PAGE_ICON = "?"
LAYOUT = "wide"
ALLOWED_EXTENSIONS = ["txt", "md", "csv", "pdf", "docx"]
MAX_FILE_SIZE_MB = 50

OLLAMA_NOT_RUNNING = """
Ollama is not running.
Please start Ollama: ollama serve
"""

MODEL_NOT_FOUND = """
Model not found: {model}
Please pull the model: ollama pull {model}
"""

def get_model_name(mode: int) -> str:
    model_key = MODE_MODELS.get(mode, "smollm")
    return OLLAMA_MODELS[model_key]

def get_fallback_model(current_model: str) -> str:
    return OLLAMA_MODELS[FALLBACK_MAP.get(current_model, "smollm")]

def get_max_tokens(model_key: str) -> int:
    return MAX_TOKENS.get(model_key, 300)

def validate_setup():
    errors = []
    if not DOCUMENTS_DIR.exists():
        errors.append(f"Documents directory not found: {DOCUMENTS_DIR}")
    if not VECTOR_DB_DIR.exists():
        errors.append(f"Vector DB directory not found: {VECTOR_DB_DIR}")
    if not OLLAMA_MODELS:
        errors.append("No Ollama models configured")
    if not EMBEDDING_MODEL:
        errors.append("No embedding model configured")
    return len(errors) == 0, errors
```

---

#### core/models.py

```python
"""
Model management for the Unified Local AI System.
"""

import subprocess
from typing import Optional, Dict, Any
from pathlib import Path

try:
    from langchain_ollama import OllamaLLM
except ImportError:
    from langchain_community.llms import Ollama as OllamaLLM

from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

from .config import (
    OLLAMA_MODELS, HUGGINGFACE_MODEL,
    MAX_TOKENS, TEMPERATURE, CONTEXT_WINDOW,
    OLLAMA_NOT_RUNNING, MODEL_NOT_FOUND
)

def check_ollama_running() -> bool:
    try:
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False

def check_model_exists(model_name: str) -> bool:
    try:
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return model_name in result.stdout
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False

def get_ollama_model(model_key: str, **kwargs) -> Optional[OllamaLLM]:
    if not check_ollama_running():
        print(OLLAMA_NOT_RUNNING)
        return None
    model_name = OLLAMA_MODELS.get(model_key)
    if not model_name:
        return None
    if not check_model_exists(model_name):
        print(MODEL_NOT_FOUND.format(model=model_name))
        return None
    params = {
        "model": model_name,
        "temperature": kwargs.get("temperature", TEMPERATURE),
        "num_predict": kwargs.get("num_predict", MAX_TOKENS.get(model_key, 300)),
        "num_ctx": kwargs.get("num_ctx", CONTEXT_WINDOW)
    }
    params.update(kwargs)
    try:
        return OllamaLLM(**params)
    except Exception as e:
        print(f"Failed to load {model_name}: {e}")
        return None

class TinyLlamaLocal:
    def __init__(self, model_name: str = HUGGINGFACE_MODEL):
        self.model_name = model_name
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tokenizer = None
        self.model = None
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            low_cpu_mem_usage=True
        )
        self.model.to(self.device)
        self.model.eval()
        self._loaded = True

    def generate(self, prompt: str, max_tokens: int = 100,
                 temperature: float = TEMPERATURE) -> str:
        if not self._loaded:
            self.load()
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs, max_new_tokens=max_tokens,
                temperature=temperature,
                do_sample=temperature > 0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        full_text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return full_text[len(prompt):].strip()

    def route_question(self, question: str) -> str:
        prompt = f"""Classify this question into exactly ONE category:
- GENERAL: factual questions, explanations, summaries
- CODE: programming, debugging, technical implementation
- MULTILINGUAL: questions in non-English languages

Question: {question}
Category:"""
        response = self.generate(prompt, max_tokens=10, temperature=0.1)
        response_upper = response.upper()
        if "CODE" in response_upper:
            return "CODE"
        elif "MULTILINGUAL" in response_upper:
            return "MULTILINGUAL"
        else:
            return "GENERAL"

    def critique_answer(self, question: str, answer: str) -> Dict[str, Any]:
        prompt = f"""Evaluate if this answer properly addresses the question.
Question: {question}
Answer: {answer}
Does the answer directly address the question?
Respond with YES or NO, then briefly explain.
Evaluation:"""
        response = self.generate(prompt, max_tokens=50, temperature=0.1)
        response_upper = response.upper()
        passes = "YES" in response_upper and \
                 "NO" not in response_upper.split("YES")[0]
        return {"passes": passes, "reason": response.strip()}

class ModelManager:
    def __init__(self):
        self.ollama_models: Dict[str, OllamaLLM] = {}
        self.tinyllama_local: Optional[TinyLlamaLocal] = None

    def get_ollama(self, model_key: str, **kwargs) -> Optional[OllamaLLM]:
        if model_key not in self.ollama_models:
            self.ollama_models[model_key] = get_ollama_model(model_key, **kwargs)
        return self.ollama_models[model_key]

    def get_tinyllama(self) -> TinyLlamaLocal:
        if self.tinyllama_local is None:
            self.tinyllama_local = TinyLlamaLocal()
        return self.tinyllama_local

    def route_question(self, question: str) -> str:
        return self.get_tinyllama().route_question(question)

    def critique_answer(self, question: str, answer: str) -> Dict[str, Any]:
        return self.get_tinyllama().critique_answer(question, answer)

    def invoke_ollama(self, model_key: str, prompt: str, **kwargs) -> str:
        model = self.get_ollama(model_key, **kwargs)
        if model is None:
            return "Error: Model not available"
        try:
            return model.invoke(prompt)
        except Exception as e:
            return f"Error generating response: {e}"

    def check_system_ready(self) -> tuple:
        issues = []
        if not check_ollama_running():
            issues.append("Ollama is not running")
            return False, issues
        for key, model_name in OLLAMA_MODELS.items():
            if not check_model_exists(model_name):
                issues.append(f"Model not found: {model_name}")
        if issues:
            return False, issues
        return True, []
```

---

#### core/embeddings.py

```python
"""
Embedding generation for the Unified Local AI System.
"""

from typing import List
from sentence_transformers import SentenceTransformer
import numpy as np
from .config import EMBEDDING_MODEL

class EmbeddingManager:
    def __init__(self, model_name: str = EMBEDDING_MODEL):
        self.model_name = model_name
        self.model = None
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        self.model = SentenceTransformer(self.model_name)
        self._loaded = True

    def embed_text(self, text: str) -> List[float]:
        if not self._loaded:
            self.load()
        try:
            return self.model.encode(text, convert_to_numpy=True).tolist()
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return []

    def embed_texts(self, texts: List[str], batch_size: int = 32,
                    show_progress: bool = False) -> List[List[float]]:
        if not self._loaded:
            self.load()
        if not texts:
            return []
        return self.model.encode(
            texts, batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True
        ).tolist()

    def cosine_similarity(self, embedding1: List[float],
                          embedding2: List[float]) -> float:
        if not embedding1 or not embedding2:
            return 0.0
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return max(0.0, min(1.0, float(dot_product / (norm1 * norm2))))

    def find_most_similar(self, query_embedding, candidate_embeddings,
                          top_k: int = 3):
        if not query_embedding or not candidate_embeddings:
            return []
        similarities = [
            (idx, self.cosine_similarity(query_embedding, candidate))
            for idx, candidate in enumerate(candidate_embeddings)
        ]
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]

    def get_embedding_dimension(self) -> int:
        if not self._loaded:
            self.load()
        return self.model.get_sentence_embedding_dimension()

_embedding_manager = None

def get_embedding_manager() -> EmbeddingManager:
    global _embedding_manager
    if _embedding_manager is None:
        _embedding_manager = EmbeddingManager()
    return _embedding_manager

def embed_text(text: str) -> List[float]:
    return get_embedding_manager().embed_text(text)

def embed_texts(texts: List[str], batch_size: int = 32,
                show_progress: bool = False) -> List[List[float]]:
    return get_embedding_manager().embed_texts(texts, batch_size, show_progress)

def cosine_similarity(embedding1, embedding2) -> float:
    return get_embedding_manager().cosine_similarity(embedding1, embedding2)

def find_most_similar(query_embedding, candidate_embeddings, top_k: int = 3):
    return get_embedding_manager().find_most_similar(
        query_embedding, candidate_embeddings, top_k
    )
```

---

#### services/vector_store.py

```python
"""
Vector store service for the Unified Local AI System.
"""

from typing import List, Dict, Any, Optional
from pathlib import Path
import chromadb
from chromadb.config import Settings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader, CSVLoader

try:
    from langchain_community.document_loaders import UnstructuredMarkdownLoader
except ImportError:
    UnstructuredMarkdownLoader = None

from core.config import (
    VECTOR_DB_DIR, CHUNK_SIZE, CHUNK_OVERLAP,
    RAG_TOP_K, RAG_SIMILARITY_THRESHOLD, ALLOWED_EXTENSIONS
)
from core.embeddings import get_embedding_manager

class VectorStore:
    def __init__(self, collection_name: str = "documents"):
        self.collection_name = collection_name
        self.db_path = str(VECTOR_DB_DIR)
        self.client = None
        self.collection = None
        self.embedding_manager = get_embedding_manager()
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        self.client = chromadb.PersistentClient(
            path=self.db_path,
            settings=Settings(anonymized_telemetry=False, allow_reset=True)
        )
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"description": "Document chunks for RAG retrieval"}
        )
        self._initialized = True

    def add_documents(self, texts, metadatas=None, ids=None) -> int:
        if not self._initialized:
            self.initialize()
        if not texts:
            return 0
        embeddings = self.embedding_manager.embed_texts(texts, show_progress=True)
        if ids is None:
            existing_count = self.collection.count()
            ids = [f"doc_{existing_count + i}" for i in range(len(texts))]
        if metadatas is None:
            metadatas = [{"source": "unknown"} for _ in texts]
        self.collection.add(
            embeddings=embeddings, documents=texts,
            metadatas=metadatas, ids=ids
        )
        return len(texts)

    def query(self, query_text, top_k=RAG_TOP_K,
              min_similarity=RAG_SIMILARITY_THRESHOLD,
              filter_metadata=None):
        if not self._initialized:
            self.initialize()
        if self.collection.count() == 0:
            return []
        query_embedding = self.embedding_manager.embed_text(query_text)
        results = self.collection.query(
            query_embeddings=[query_embedding], n_results=top_k,
            where=filter_metadata
        )
        formatted = []
        if results['documents'] and results['documents'][0]:
            for i, doc in enumerate(results['documents'][0]):
                distance = results['distances'][0][i]
                similarity = 1 - (distance / 2)
                if similarity >= min_similarity:
                    formatted.append({
                        'text': doc,
                        'metadata': results['metadatas'][0][i],
                        'similarity': similarity,
                        'id': results['ids'][0][i]
                    })
        return formatted

    def delete_by_source(self, source: str) -> int:
        if not self._initialized:
            self.initialize()
        results = self.collection.get(where={"source": source})
        if results['ids']:
            self.collection.delete(ids=results['ids'])
            return len(results['ids'])
        return 0

    def get_sources(self) -> List[str]:
        if not self._initialized:
            self.initialize()
        try:
            sources = set()
            batch_size = 100
            offset = 0
            while True:
                try:
                    results = self.collection.get(
                        limit=batch_size, offset=offset
                    )
                    if not results['ids']:
                        break
                    if results['metadatas']:
                        for meta in results['metadatas']:
                            sources.add(meta.get('source', 'unknown'))
                    offset += batch_size
                except Exception:
                    break
            return sorted(list(sources))
        except Exception as e:
            print(f"Error getting sources: {e}")
            return []

    def count(self) -> int:
        if not self._initialized:
            self.initialize()
        try:
            return self.collection.count()
        except Exception as e:
            self._initialized = False
            self.initialize()
            return self.collection.count()

    def clear(self):
        if not self._initialized:
            self.initialize()
        try:
            try:
                self.client.delete_collection(name=self.collection_name)
            except Exception:
                pass
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"description": "Document chunks for RAG retrieval"}
            )
        except Exception as e:
            print(f"Error clearing vector store: {e}")
        finally:
            self._initialized = False
            self.initialize()

class DocumentIndexer:
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def load_document(self, file_path: Path):
        suffix = file_path.suffix.lower()
        try:
            if suffix == '.txt':
                loader = TextLoader(str(file_path), encoding='utf-8')
            elif suffix == '.md':
                if UnstructuredMarkdownLoader is None:
                    loader = TextLoader(str(file_path), encoding='utf-8')
                else:
                    loader = UnstructuredMarkdownLoader(str(file_path))
            elif suffix == '.csv':
                loader = CSVLoader(str(file_path))
            else:
                return None
            documents = loader.load()
            return [doc.page_content for doc in documents]
        except Exception as e:
            print(f"Error loading {file_path.name}: {e}")
            return None

    def chunk_text(self, texts):
        all_chunks = []
        for text in texts:
            all_chunks.extend(self.text_splitter.split_text(text))
        return all_chunks

    def index_file(self, file_path: Path) -> int:
        texts = self.load_document(file_path)
        if not texts:
            return 0
        chunks = self.chunk_text(texts)
        if not chunks:
            return 0
        metadatas = [
            {"source": file_path.name, "file_type": file_path.suffix.lower(),
             "chunk_index": i}
            for i in range(len(chunks))
        ]
        return self.vector_store.add_documents(chunks, metadatas)

    def reindex_file(self, file_path: Path) -> int:
        self.vector_store.delete_by_source(file_path.name)
        return self.index_file(file_path)

def create_vector_store() -> VectorStore:
    store = VectorStore()
    store.initialize()
    return store

def create_indexer(vector_store=None) -> DocumentIndexer:
    if vector_store is None:
        vector_store = create_vector_store()
    return DocumentIndexer(vector_store)
```

---

#### services/correction_memory.py

```python
"""
Correction memory service for the Unified Local AI System.
"""

import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

from core.config import (
    CORRECTIONS_FILE, MEMORY_SIMILARITY_THRESHOLD, MAX_CORRECTIONS
)
from core.embeddings import get_embedding_manager

class CorrectionMemory:
    def __init__(self, filepath: Path = CORRECTIONS_FILE):
        self.filepath = filepath
        self.corrections: List[Dict[str, Any]] = []
        self.embedding_manager = get_embedding_manager()
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        if not self.filepath.exists():
            self.corrections = []
            self.save()
            self._loaded = True
            return
        with open(self.filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            self.corrections = data.get('corrections', [])
        self._loaded = True

    def save(self):
        data = {
            'corrections': self.corrections,
            'last_updated': datetime.now().isoformat(),
            'count': len(self.corrections)
        }
        with open(self.filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def add_correction(self, question, wrong_answer, correct_answer,
                       metadata=None) -> bool:
        if not self._loaded:
            self.load()
        embedding = self.embedding_manager.embed_text(question)
        if not embedding:
            return False
        if len(self.corrections) >= MAX_CORRECTIONS:
            self.corrections.pop(0)
        self.corrections.append({
            'question': question,
            'question_embedding': embedding,
            'wrong_answer': wrong_answer,
            'correct_answer': correct_answer,
            'timestamp': datetime.now().isoformat(),
            'metadata': metadata or {}
        })
        self.save()
        return True

    def find_similar_question(self, question, threshold=MEMORY_SIMILARITY_THRESHOLD):
        if not self._loaded:
            self.load()
        if not self.corrections:
            return None
        query_embedding = self.embedding_manager.embed_text(question)
        if not query_embedding:
            return None
        stored_embeddings = [c['question_embedding'] for c in self.corrections]
        results = self.embedding_manager.find_most_similar(
            query_embedding, stored_embeddings, top_k=1
        )
        if not results:
            return None
        idx, similarity = results[0]
        if similarity >= threshold:
            correction = self.corrections[idx].copy()
            correction['similarity'] = similarity
            return correction
        return None

    def check_memory(self, question, threshold=MEMORY_SIMILARITY_THRESHOLD):
        result = self.find_similar_question(question, threshold)
        if result:
            return True, result['correct_answer'], result['similarity']
        return False, None, None

    def get_all_corrections(self):
        if not self._loaded:
            self.load()
        return [
            {
                'question': c['question'],
                'wrong_answer': c['wrong_answer'],
                'correct_answer': c['correct_answer'],
                'timestamp': c['timestamp'],
                'metadata': c.get('metadata', {})
            }
            for c in self.corrections
        ]

    def count(self) -> int:
        if not self._loaded:
            self.load()
        return len(self.corrections)

def create_correction_memory() -> CorrectionMemory:
    memory = CorrectionMemory()
    memory.load()
    return memory
```

---

#### modules/file_manager.py

```python
"""
File manager module for the Unified Local AI System.
"""

from typing import List, Dict, Any, Optional
from pathlib import Path
from core.config import DOCUMENTS_DIR, ALLOWED_EXTENSIONS
from services import create_vector_store, create_indexer

class FileManager:
    def __init__(self):
        self.documents_dir = DOCUMENTS_DIR
        self.documents_dir.mkdir(exist_ok=True)
        self.vector_store = create_vector_store()
        self.indexer = create_indexer(self.vector_store)

    def get_all_files(self):
        files = []
        for ext in ALLOWED_EXTENSIONS:
            for file_path in self.documents_dir.glob(f"*.{ext}"):
                if file_path.is_file():
                    files.append({
                        'name': file_path.name,
                        'extension': file_path.suffix.lower(),
                        'size_bytes': file_path.stat().st_size,
                        'size_kb': round(file_path.stat().st_size / 1024, 2),
                        'path': file_path
                    })
        files.sort(key=lambda x: x['name'].lower())
        return files

    def get_indexed_sources(self):
        return self.vector_store.get_sources()

    def get_file_status(self):
        all_files = self.get_all_files()
        indexed_sources = set(self.get_indexed_sources())
        indexed_files = [f for f in all_files if f['name'] in indexed_sources]
        unindexed_files = [f for f in all_files if f['name'] not in indexed_sources]
        return {
            'total_files': len(all_files),
            'indexed_count': len(indexed_files),
            'unindexed_count': len(unindexed_files),
            'total_chunks': self.vector_store.count(),
            'indexed_files': indexed_files,
            'unindexed_files': unindexed_files,
            'all_files': all_files
        }

    def upload_file(self, uploaded_file, save_name=None):
        try:
            filename = save_name if save_name else uploaded_file.name
            file_path = self.documents_dir / filename
            if file_path.exists():
                return {
                    'success': False,
                    'message': f"File '{filename}' already exists.",
                    'file_path': None
                }
            extension = Path(filename).suffix.lower().lstrip('.')
            if extension not in ALLOWED_EXTENSIONS:
                return {
                    'success': False,
                    'message': f"File type '.{extension}' not supported.",
                    'file_path': None
                }
            with open(file_path, 'wb') as f:
                f.write(uploaded_file.getbuffer())
            return {
                'success': True,
                'message': f"Uploaded '{filename}'",
                'file_path': file_path,
                'filename': filename,
                'size_bytes': file_path.stat().st_size
            }
        except Exception as e:
            return {'success': False, 'message': f"Error: {e}", 'file_path': None}

    def delete_file(self, filename, remove_from_index=True):
        file_path = self.documents_dir / filename
        if not file_path.exists():
            return {'success': False, 'message': f"File '{filename}' not found"}
        chunks_deleted = 0
        if remove_from_index:
            chunks_deleted = self.vector_store.delete_by_source(filename)
        file_path.unlink()
        return {
            'success': True,
            'message': f"Deleted '{filename}' ({chunks_deleted} chunks removed)",
            'chunks_deleted': chunks_deleted
        }

    def index_file(self, filename):
        file_path = self.documents_dir / filename
        if not file_path.exists():
            return {'success': False, 'message': f"File '{filename}' not found",
                    'chunks_indexed': 0}
        try:
            chunks = self.indexer.index_file(file_path)
            return {'success': True, 'message': f"Indexed '{filename}' ({chunks} chunks)",
                    'chunks_indexed': chunks}
        except Exception as e:
            return {'success': False, 'message': f"Error: {e}", 'chunks_indexed': 0}

    def reindex_file(self, filename):
        file_path = self.documents_dir / filename
        if not file_path.exists():
            return {'success': False, 'message': f"File '{filename}' not found",
                    'chunks_indexed': 0}
        try:
            chunks = self.indexer.reindex_file(file_path)
            return {'success': True, 'message': f"Reindexed '{filename}' ({chunks} chunks)",
                    'chunks_indexed': chunks}
        except Exception as e:
            return {'success': False, 'message': f"Error: {e}", 'chunks_indexed': 0}

    def index_all_files(self):
        status = self.get_file_status()
        unindexed = status['unindexed_files']
        if not unindexed:
            return {'success': True, 'message': 'All files already indexed',
                    'files_indexed': 0, 'total_chunks': 0, 'results': {}}
        results = {}
        total_chunks = 0
        for file_info in unindexed:
            result = self.index_file(file_info['name'])
            results[file_info['name']] = result
            if result['success']:
                total_chunks += result['chunks_indexed']
        successful = sum(1 for r in results.values() if r['success'])
        return {
            'success': True,
            'message': f"Indexed {successful}/{len(unindexed)} files ({total_chunks} chunks)",
            'files_indexed': successful,
            'total_chunks': total_chunks,
            'results': results
        }

    def clear_index(self):
        try:
            old_count = self.vector_store.count()
            self.vector_store.clear()
            return {'success': True,
                    'message': f"Cleared index ({old_count} chunks removed)",
                    'chunks_removed': old_count}
        except Exception as e:
            return {'success': False, 'message': f"Error: {e}", 'chunks_removed': 0}

def create_file_manager() -> FileManager:
    return FileManager()
```

---

#### modules/text_analysis.py

```python
"""
Text analysis module for the Unified Local AI System.
Voyant-style analysis features using pure Python (no AI calls).
"""

from typing import List, Dict, Any, Tuple
from collections import Counter
import io

import nltk
from nltk.tokenize import word_tokenize, sent_tokenize
from nltk.corpus import stopwords

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

from wordcloud import WordCloud
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go

from core.config import (
    STOPWORD_LANGUAGES, DEFAULT_STOPWORD_LANG, WORD_FREQ_TOP_N,
    WORDCLOUD_WIDTH, WORDCLOUD_HEIGHT, WORDCLOUD_BACKGROUND, KWIC_MAX_RESULTS
)

class TextAnalyzer:
    def __init__(self, text: str, language: str = DEFAULT_STOPWORD_LANG):
        self.text = text
        self.language = language if language in STOPWORD_LANGUAGES \
            else DEFAULT_STOPWORD_LANG
        self.tokens = self._tokenize()
        self.sentences = self._get_sentences()
        self.stop_words = set(stopwords.words(self.language))
        self.filtered_tokens = self._filter_stopwords()

    def _tokenize(self):
        return [t for t in word_tokenize(self.text.lower()) if t.isalpha()]

    def _get_sentences(self):
        return sent_tokenize(self.text)

    def _filter_stopwords(self):
        return [t for t in self.tokens if t not in self.stop_words]

    def get_word_frequency(self, top_n=WORD_FREQ_TOP_N):
        return Counter(self.filtered_tokens).most_common(top_n)

    def get_statistics(self):
        total_words = len(self.tokens)
        unique_words = len(set(self.tokens))
        total_filtered = len(self.filtered_tokens)
        return {
            'total_words': total_words,
            'unique_words': unique_words,
            'vocabulary_diversity': round(unique_words / total_words, 3)
                if total_words > 0 else 0,
            'total_sentences': len(self.sentences),
            'avg_sentence_length': round(total_words / len(self.sentences), 1)
                if self.sentences else 0,
            'filtered_words': total_filtered,
            'unique_filtered': len(set(self.filtered_tokens)),
            'stopwords_removed': total_words - total_filtered,
            'character_count': len(self.text),
            'longest_word': max(self.filtered_tokens, key=len)
                if self.filtered_tokens else "",
            'avg_word_length': round(
                sum(len(w) for w in self.filtered_tokens) / len(self.filtered_tokens),
                1) if self.filtered_tokens else 0
        }

    def get_kwic(self, search_term, max_results=KWIC_MAX_RESULTS):
        search_lower = search_term.lower()
        return [s for s in self.sentences if search_lower in s.lower()][:max_results]

    def generate_word_cloud_image(self) -> bytes:
        if not self.filtered_tokens:
            fig, ax = plt.subplots(figsize=(8, 4))
            ax.text(0.5, 0.5, 'No words to display', ha='center', va='center')
            ax.axis('off')
            buf = io.BytesIO()
            plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
            plt.close()
            buf.seek(0)
            return buf.getvalue()
        wc = WordCloud(
            width=WORDCLOUD_WIDTH, height=WORDCLOUD_HEIGHT,
            background_color=WORDCLOUD_BACKGROUND,
            colormap='viridis', max_words=100, relative_scaling=0.5
        )
        wc.generate(' '.join(self.filtered_tokens))
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.imshow(wc, interpolation='bilinear')
        ax.axis('off')
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        plt.close()
        buf.seek(0)
        return buf.getvalue()

    def create_frequency_chart(self, top_n=WORD_FREQ_TOP_N):
        freq = self.get_word_frequency(top_n)
        if not freq:
            return go.Figure()
        words, counts = zip(*freq)
        fig = px.bar(x=list(words), y=list(counts),
                     labels={'x': 'Word', 'y': 'Frequency'},
                     title=f'Top {len(words)} Most Frequent Words')
        fig.update_layout(xaxis_tickangle=-45, showlegend=False, height=400)
        return fig

    def create_word_length_distribution(self):
        if not self.filtered_tokens:
            return go.Figure()
        fig = px.histogram(
            x=[len(w) for w in self.filtered_tokens],
            labels={'x': 'Word Length (characters)', 'y': 'Frequency'},
            title='Word Length Distribution', nbins=15
        )
        fig.update_layout(showlegend=False, height=400)
        return fig

    def get_ngrams(self, n=2, top_k=10):
        if len(self.filtered_tokens) < n:
            return []
        ngrams = [
            ' '.join(self.filtered_tokens[i:i+n])
            for i in range(len(self.filtered_tokens) - n + 1)
        ]
        return Counter(ngrams).most_common(top_k)

def analyze_text(text: str, language: str = DEFAULT_STOPWORD_LANG) -> TextAnalyzer:
    return TextAnalyzer(text, language)
```

---

#### modules/ai_pipeline.py

```python
"""
AI query pipeline for the Unified Local AI System.
"""

from typing import Dict, Any, Optional, List, Tuple
from enum import Enum
from core.config import (
    MODE_MODELS, FALLBACK_MAP, RAG_TOP_K,
    MAX_RETRIES, MEMORY_SIMILARITY_THRESHOLD
)
from core.models import ModelManager
from services import create_correction_memory, create_vector_store

class QueryMode(Enum):
    SMOLLM_ONLY = 1
    QWEN_ONLY = 2
    FULL_PIPELINE = 3
    TINYLLAMA_ONLY = 4

class PipelineResult:
    def __init__(self):
        self.answer: str = ""
        self.sources: List[Dict[str, Any]] = []
        self.model_used: str = ""
        self.mode: Optional[QueryMode] = None
        self.memory_hit: bool = False
        self.memory_similarity: float = 0.0
        self.rag_used: bool = False
        self.rag_chunks: int = 0
        self.critique_passed: bool = False
        self.retries: int = 0
        self.route_category: Optional[str] = None
        self.execution_path: List[str] = []

    def to_dict(self):
        return {
            'answer': self.answer, 'sources': self.sources,
            'model_used': self.model_used,
            'mode': self.mode.value if self.mode else None,
            'memory_hit': self.memory_hit,
            'memory_similarity': self.memory_similarity,
            'rag_used': self.rag_used, 'rag_chunks': self.rag_chunks,
            'critique_passed': self.critique_passed,
            'retries': self.retries, 'route_category': self.route_category,
            'execution_path': self.execution_path
        }

class AIPipeline:
    def __init__(self, use_rag=True, use_memory=True,
                 mode=QueryMode.FULL_PIPELINE):
        self.use_rag = use_rag
        self.use_memory = use_memory
        self.mode = mode
        self.model_manager = ModelManager()
        self.correction_memory = create_correction_memory() if use_memory else None
        self.vector_store = create_vector_store() if use_rag else None

    def query(self, question: str) -> PipelineResult:
        result = PipelineResult()
        result.mode = self.mode
        result.execution_path.append("START")

        if self.use_memory and self.correction_memory:
            result.execution_path.append("memory_check")
            found, answer, similarity = self.correction_memory.check_memory(
                question, threshold=MEMORY_SIMILARITY_THRESHOLD
            )
            if found:
                result.answer = answer
                result.memory_hit = True
                result.memory_similarity = similarity
                result.execution_path.append("memory_hit -> RETURN")
                return result

        rag_context = ""
        if self.use_rag and self.vector_store:
            result.execution_path.append("rag_retrieval")
            rag_results = self.vector_store.query(question, top_k=RAG_TOP_K)
            if rag_results:
                result.rag_used = True
                result.rag_chunks = len(rag_results)
                result.sources = rag_results
                rag_context = "\n\n".join(
                    [f"[{i+1}] {doc['text']}" for i, doc in enumerate(rag_results)]
                )

        if self.mode == QueryMode.SMOLLM_ONLY:
            result.answer, result.model_used = self._process_with_model(
                "smollm", question, rag_context
            )
            result.critique_passed = True

        elif self.mode == QueryMode.QWEN_ONLY:
            result.answer, result.model_used = self._process_with_model(
                "qwen", question, rag_context
            )
            result.critique_passed = True

        elif self.mode == QueryMode.TINYLLAMA_ONLY:
            result.answer, result.model_used = self._process_with_model(
                "tinyllama", question, rag_context
            )
            result.critique_passed = True

        elif self.mode == QueryMode.FULL_PIPELINE:
            self._process_full_pipeline(question, rag_context, result)

        result.execution_path.append("END")
        return result

    def _process_full_pipeline(self, question, rag_context, result):
        category = self.model_manager.route_question(question)
        result.route_category = category
        primary_model = "qwen" if category in ("CODE", "MULTILINGUAL") else "smollm"

        for attempt in range(MAX_RETRIES + 1):
            if attempt > 0:
                result.retries += 1
                current_model = FALLBACK_MAP.get(primary_model, "smollm")
            else:
                current_model = primary_model
            answer, model_used = self._process_with_model(
                current_model, question, rag_context
            )
            result.model_used = model_used
            critique = self.model_manager.critique_answer(question, answer)
            if critique['passes']:
                result.answer = answer
                result.critique_passed = True
                return
        result.answer = answer
        result.critique_passed = False

    def _process_with_model(self, model_key, question, rag_context):
        prompt = f"""Based on the following context, answer the question.

Context:
{rag_context}

Question: {question}

Answer:""" if rag_context else question
        model = self.model_manager.get_ollama(model_key)
        if model is None:
            return "Error: Model not available", model_key
        try:
            return model.invoke(prompt), model_key
        except Exception as e:
            return f"Error: {e}", model_key

    def add_correction(self, question, wrong_answer, correct_answer,
                       model_used) -> bool:
        if not self.correction_memory:
            return False
        return self.correction_memory.add_correction(
            question=question, wrong_answer=wrong_answer,
            correct_answer=correct_answer,
            metadata={'model': model_used, 'mode': self.mode.value}
        )

    def set_mode(self, mode: QueryMode):
        self.mode = mode

    def get_status(self) -> Dict[str, Any]:
        status = {
            'mode': self.mode.name,
            'rag_enabled': self.use_rag,
            'memory_enabled': self.use_memory
        }
        if self.use_rag and self.vector_store:
            try:
                status['rag_chunks'] = self.vector_store.count()
                status['rag_sources'] = len(self.vector_store.get_sources())
            except Exception:
                status['rag_chunks'] = 0
                status['rag_sources'] = 0
        if self.use_memory and self.correction_memory:
            status['corrections_count'] = self.correction_memory.count()
        return status

def create_pipeline(use_rag=True, use_memory=True,
                    mode=QueryMode.FULL_PIPELINE) -> AIPipeline:
    return AIPipeline(use_rag=use_rag, use_memory=use_memory, mode=mode)
```

---

#### app.py

```python
"""
Unified Local AI System - Main Application
"""

import streamlit as st
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))

from core.config import (
    PAGE_TITLE, PAGE_ICON, LAYOUT,
    STOPWORD_LANGUAGES, DEFAULT_STOPWORD_LANG
)
from core.models import check_ollama_running
from modules import (
    create_file_manager, analyze_text,
    create_pipeline, QueryMode
)

st.set_page_config(page_title=PAGE_TITLE, page_icon=PAGE_ICON, layout=LAYOUT)

if 'pipeline' not in st.session_state:
    st.session_state.pipeline = create_pipeline(
        use_rag=True, use_memory=True, mode=QueryMode.FULL_PIPELINE
    )
if 'file_manager' not in st.session_state:
    st.session_state.file_manager = create_file_manager()
if 'query_history' not in st.session_state:
    st.session_state.query_history = []

with st.sidebar:
    st.title("System Status")
    ollama_running = check_ollama_running()
    if ollama_running:
        st.success("Ollama is running")
    else:
        st.error("Ollama is not running")
        st.info("Start Ollama: ollama serve")
    st.divider()
    st.subheader("AI Configuration")
    mode_options = {
        "Mode 1: SmolLM Only (Fast)": QueryMode.SMOLLM_ONLY,
        "Mode 2: Qwen Only (Code)": QueryMode.QWEN_ONLY,
        "Mode 3: Full Pipeline (Best)": QueryMode.FULL_PIPELINE,
        "Mode 4: TinyLlama Only (Fastest)": QueryMode.TINYLLAMA_ONLY
    }
    selected_mode = st.selectbox("Query Mode", list(mode_options.keys()), index=2)
    st.session_state.pipeline.set_mode(mode_options[selected_mode])
    rag_enabled = st.checkbox(
        "Enable RAG", value=st.session_state.pipeline.use_rag
    )
    st.session_state.pipeline.use_rag = rag_enabled
    memory_enabled = st.checkbox(
        "Enable Correction Memory", value=st.session_state.pipeline.use_memory
    )
    st.session_state.pipeline.use_memory = memory_enabled
    st.divider()
    st.subheader("Statistics")
    try:
        status = st.session_state.pipeline.get_status()
        if 'rag_chunks' in status:
            st.metric("Indexed Chunks", status['rag_chunks'])
            st.metric("Indexed Files", status['rag_sources'])
        if 'corrections_count' in status:
            st.metric("Saved Corrections", status['corrections_count'])
    except Exception:
        st.info("Status unavailable")

st.title("Unified Local AI System")
st.caption("Local document analysis and AI-powered Q&A")

tab1, tab2, tab3 = st.tabs(["File Manager", "Text Analysis", "AI Query"])

with tab1:
    st.header("Document Repository")

    st.subheader("Step 1: Upload Files")
    uploaded_files = st.file_uploader(
        "Choose files to upload",
        type=['txt', 'md', 'csv', 'pdf', 'docx'],
        accept_multiple_files=True
    )
    if uploaded_files:
        if st.button("Upload Files", type="primary", use_container_width=True):
            with st.spinner("Uploading files..."):
                uploaded_count = 0
                for uploaded_file in uploaded_files:
                    result = st.session_state.file_manager.upload_file(uploaded_file)
                    if result['success']:
                        st.success(result['message'])
                        uploaded_count += 1
                    else:
                        st.error(result['message'])
                if uploaded_count > 0:
                    st.info(f"{uploaded_count} file(s) uploaded. Go to Step 2 to index them.")

    st.divider()
    st.subheader("Step 2: Index Files")

    status = st.session_state.file_manager.get_file_status()
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Files", status['total_files'])
    col2.metric("Indexed", status['indexed_count'])
    col3.metric("Unindexed", status['unindexed_count'])
    col4.metric("Total Chunks", status['total_chunks'])

    if status['unindexed_files']:
        st.caption("Files ready to index:")
        for file_info in status['unindexed_files']:
            col1, col2 = st.columns([3, 1])
            with col1:
                st.text(f"o {file_info['name']} ({file_info['size_kb']} KB)")
            with col2:
                if st.button("Index", key=f"index_{file_info['name']}",
                             use_container_width=True):
                    with st.spinner(f"Indexing {file_info['name']}..."):
                        result = st.session_state.file_manager.index_file(
                            file_info['name']
                        )
                        if result['success']:
                            st.success(result['message'])
                            st.rerun()
                        else:
                            st.error(result['message'])
        st.divider()
        if st.button("Index All Unindexed Files", type="primary",
                     use_container_width=True):
            with st.spinner("Indexing all files..."):
                result = st.session_state.file_manager.index_all_files()
                st.success(result['message'])
                st.rerun()
    else:
        st.info("All files are indexed!")

    st.divider()
    st.subheader("Manage Files")
    if status['indexed_files']:
        for file_info in status['indexed_files']:
            col1, col2, col3 = st.columns([3, 1, 1])
            with col1:
                st.text(f"✓ {file_info['name']} ({file_info['size_kb']} KB)")
            with col2:
                if st.button("Reindex", key=f"reindex_{file_info['name']}",
                             use_container_width=True):
                    result = st.session_state.file_manager.reindex_file(
                        file_info['name']
                    )
                    st.success(result['message'])
                    st.rerun()
            with col3:
                if st.button("Delete", key=f"delete_{file_info['name']}",
                             use_container_width=True):
                    result = st.session_state.file_manager.delete_file(
                        file_info['name']
                    )
                    st.success(result['message'])
                    st.rerun()

    st.divider()
    st.subheader("Database Management")
    col1, col2 = st.columns(2)
    with col1:
        if st.button("Clear All Index", use_container_width=True):
            result = st.session_state.file_manager.clear_index()
            st.warning(result['message'])
            st.rerun()
    with col2:
        if st.button("Reinitialize Vector Store", use_container_width=True):
            try:
                st.session_state.file_manager.vector_store._initialized = False
                st.session_state.file_manager.vector_store.initialize()
                st.success("Reinitialized successfully")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

with tab2:
    st.header("Text Analysis")
    all_files = st.session_state.file_manager.get_all_files()
    if all_files:
        file_options = ["[Select a file]"] + [f['name'] for f in all_files]
        selected_file = st.selectbox("Choose a file to analyze", file_options)
        if selected_file != "[Select a file]":
            file_path = st.session_state.file_manager.documents_dir / selected_file
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                language = st.selectbox(
                    "Stopword Language", options=STOPWORD_LANGUAGES,
                    index=STOPWORD_LANGUAGES.index(DEFAULT_STOPWORD_LANG)
                )
                with st.spinner("Analyzing text..."):
                    analyzer = analyze_text(text, language)
                st.subheader("Statistics")
                stats = analyzer.get_statistics()
                col1, col2, col3, col4 = st.columns(4)
                col1.metric("Total Words", stats['total_words'])
                col2.metric("Unique Words", stats['unique_words'])
                col3.metric("Sentences", stats['total_sentences'])
                col4.metric("Vocab Diversity", f"{stats['vocabulary_diversity']:.3f}")
                st.divider()
                st.subheader("Word Frequency")
                top_n = st.slider("Words to display", 10, 50, 30)
                fig = analyzer.create_frequency_chart(top_n=top_n)
                st.plotly_chart(fig, use_container_width=True)
                st.divider()
                st.subheader("Word Cloud")
                st.image(analyzer.generate_word_cloud_image())
                st.divider()
                st.subheader("Keywords in Context (KWIC)")
                search_term = st.text_input("Search for a word or phrase")
                if search_term:
                    kwic_results = analyzer.get_kwic(search_term)
                    if kwic_results:
                        for i, sentence in enumerate(kwic_results, 1):
                            st.markdown(f"{i}. {sentence}")
                    else:
                        st.warning(f"No occurrences of '{search_term}' found")
                st.divider()
                col1, col2 = st.columns(2)
                with col1:
                    st.subheader("Word Length Distribution")
                    st.plotly_chart(
                        analyzer.create_word_length_distribution(),
                        use_container_width=True
                    )
                with col2:
                    st.subheader("Top Bigrams")
                    bigrams = analyzer.get_ngrams(n=2, top_k=10)
                    if bigrams:
                        st.dataframe(
                            [(ng, c) for ng, c in bigrams],
                            column_config={"0": "Bigram", "1": "Frequency"},
                            hide_index=True
                        )
            except Exception as e:
                st.error(f"Error loading file: {e}")
    else:
        st.info("Upload files in the File Manager tab first.")

with tab3:
    st.header("AI-Powered Q&A")
    if not ollama_running:
        st.error("Ollama is not running. Please start Ollama to use AI features.")
        st.code("ollama serve")
    else:
        question = st.text_area(
            "Ask a question",
            placeholder="What is the main topic of my documents?",
            height=100
        )
        col1, col2 = st.columns([1, 3])
        with col1:
            ask_button = st.button("Ask", type="primary", use_container_width=True)
        with col2:
            if st.session_state.query_history:
                if st.button("Clear History", use_container_width=True):
                    st.session_state.query_history = []
                    st.rerun()

        if ask_button and question.strip():
            with st.spinner("Processing..."):
                result = st.session_state.pipeline.query(question)
                st.session_state.query_history.append({
                    'question': question, 'result': result
                })

        if st.session_state.query_history:
            st.divider()
            for i, item in enumerate(reversed(st.session_state.query_history)):
                q = item['question']
                r = item['result']
                with st.expander(f"Q: {q[:80]}...", expanded=(i == 0)):
                    st.markdown(f"**Question:** {q}")
                    st.markdown("**Answer:**")
                    if r.memory_hit:
                        st.info(f"Memory Hit (similarity: {r.memory_similarity:.2f})")
                    st.markdown(r.answer)
                    st.divider()
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.caption(f"**Model:** {r.model_used}")
                        st.caption(f"**Mode:** {r.mode.name if r.mode else 'N/A'}")
                    with col2:
                        st.caption(
                            f"**RAG:** {'yes' if r.rag_used else 'no'} "
                            f"({r.rag_chunks} chunks)"
                        )
                        st.caption(f"**Memory:** {'yes' if r.memory_hit else 'no'}")
                    with col3:
                        st.caption(
                            f"**Critique:** {'passed' if r.critique_passed else 'failed'}"
                        )
                        st.caption(f"**Retries:** {r.retries}")
                    if r.sources:
                        with st.expander("Sources"):
                            for j, source in enumerate(r.sources, 1):
                                st.markdown(
                                    f"**[{j}]** {source['metadata']['source']} "
                                    f"(similarity: {source['similarity']:.2f})"
                                )
                                st.caption(source['text'][:200] + "...")
                    with st.expander("Execution Path (Debug)"):
                        st.code(" -> ".join(r.execution_path))
                    st.divider()
                    with st.form(key=f"correction_form_{i}"):
                        st.subheader("Correct This Answer")
                        correct_answer = st.text_area(
                            "Correct answer", height=100
                        )
                        if st.form_submit_button("Save Correction"):
                            if correct_answer.strip():
                                success = st.session_state.pipeline.add_correction(
                                    question=q, wrong_answer=r.answer,
                                    correct_answer=correct_answer,
                                    model_used=r.model_used
                                )
                                if success:
                                    st.success("Correction saved to memory")
                                else:
                                    st.error("Failed to save correction")

st.divider()
st.caption("Unified Local AI System - Fully local, no data leaves your machine")
```

---

#### launcher.py

```python
#!/usr/bin/env python3
"""
Simple launcher for Unified Local AI System.
"""

import subprocess
import sys
import os
from pathlib import Path
import platform

PROJECT_DIR = Path(__file__).parent
VENV_DIR = PROJECT_DIR / "venv"
APP_FILE = PROJECT_DIR / "app.py"

def main():
    print("=" * 60)
    print("UNIFIED LOCAL AI SYSTEM - STARTING")
    print("=" * 60)
    system = platform.system()
    if system == "Windows":
        python_exe = VENV_DIR / "Scripts" / "python.exe"
    else:
        python_exe = VENV_DIR / "bin" / "python"
    if not python_exe.exists():
        print(f"Error: Virtual environment not found at {VENV_DIR}")
        sys.exit(1)
    print("\nChecking Ollama...")
    try:
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, timeout=5
        )
        if result.returncode == 0:
            print("Ollama is running")
        else:
            print("Ollama not running. Start with: ollama serve")
    except:
        print("Ollama not found. Install from https://ollama.ai")
    print(f"\nStarting Streamlit on port 8888...")
    print(f"Open your browser to: http://localhost:8888")
    print("\nPress Ctrl+C to stop\n")
    cmd = [
        str(python_exe), "-m", "streamlit", "run",
        str(APP_FILE),
        "--server.port=8888",
        "--server.headless=true",
        "--browser.gatherUsageStats=false"
    ]
    try:
        subprocess.run(cmd, cwd=str(PROJECT_DIR))
    except KeyboardInterrupt:
        print("\n\nShutting down...")

if __name__ == "__main__":
    main()
```

---

#### launch.sh

```bash
#!/bin/bash
echo "Starting Unified Local AI System..."
echo ""
echo "Open your browser to: http://localhost:8888"
echo "Press Ctrl+C to stop"
echo ""
cd "$(dirname "$0")"
source venv/bin/activate
python -m streamlit run app.py --server.port=8888
```

---

#### launch.bat

```batch
@echo off
echo Starting Unified Local AI System...
echo.
echo Open your browser to: http://localhost:8888
echo Press Ctrl+C to stop
echo.
cd /d "%~dp0"
call venv\Scripts\activate
python -m streamlit run app.py --server.port=8888
pause
```

---

## TROUBLESHOOTING SECTION

---

### Issue 1: Browser Cannot Connect to Server

The launcher script starts successfully in bash but the browser says it cannot connect to the server at the specified port.

The problem is that Streamlit is either not starting at all or starting on a different port than expected. Port 8501 (Streamlit's default) may be blocked by a firewall, already in use by another application, or restricted on your system.

The fix is to always specify port 8888 explicitly and run Streamlit manually to confirm it is actually starting:

```
source venv/bin/activate
streamlit run app.py --server.port=8888
```

Look for the line in the terminal that says "Local URL: http://localhost:8888" and use that exact address. If you see a different port number in the output, use that one.

Replace launcher.py with a simpler version that uses port 8888 directly and removes complex process management:

```python
import subprocess
import sys
from pathlib import Path
import platform

PROJECT_DIR = Path(__file__).parent
VENV_DIR = PROJECT_DIR / "venv"
APP_FILE = PROJECT_DIR / "app.py"

system = platform.system()
if system == "Windows":
    python_exe = VENV_DIR / "Scripts" / "python.exe"
else:
    python_exe = VENV_DIR / "bin" / "python"

cmd = [
    str(python_exe), "-m", "streamlit", "run",
    str(APP_FILE),
    "--server.port=8888",
    "--server.headless=true",
    "--browser.gatherUsageStats=false"
]

subprocess.run(cmd, cwd=str(PROJECT_DIR))
```

---

### Issue 2: ModuleNotFoundError - langchain.text_splitter

The import statement in vector_store.py uses the old LangChain module path. In recent LangChain versions the text splitter was moved to a separate package.

Install the missing package:

```
pip install langchain-text-splitters
```

Then update the import in services/vector_store.py from:

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
```

To:

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter
```

---

### Issue 3: ModuleNotFoundError - unstructured

The unstructured package handles markdown file parsing but did not install with the initial requirements.

```
pip install unstructured
```

If that fails, make the import optional in services/vector_store.py:

```python
try:
    from langchain_community.document_loaders import UnstructuredMarkdownLoader
except ImportError:
    UnstructuredMarkdownLoader = None
```

Then in the load_document method:

```python
elif suffix == '.md':
    if UnstructuredMarkdownLoader is None:
        loader = TextLoader(str(file_path), encoding='utf-8')
    else:
        loader = UnstructuredMarkdownLoader(str(file_path))
```

---

### Issue 4: NLTK punkt_tab Resource Not Found

NLTK data packages were not downloaded after installation. Run this once after installing requirements:

```
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"
```

---

### Issue 5: ModuleNotFoundError - markdown

The markdown package did not install with requirements:

```
pip install markdown
```

---

### Issue 6: ChromaDB Collection Does Not Exist After Clearing Index

When clearing the index, ChromaDB deletes the collection but the application still holds a reference to the old collection ID. On the next request it throws a NotFoundError.

Update the count() method in services/vector_store.py to handle this gracefully:

```python
def count(self) -> int:
    if not self._initialized:
        self.initialize()
    try:
        return self.collection.count()
    except Exception as e:
        self._initialized = False
        self.initialize()
        return self.collection.count()
```

Update the clear() method to force reinitialization after clearing:

```python
def clear(self):
    if not self._initialized:
        self.initialize()
    try:
        try:
            self.client.delete_collection(name=self.collection_name)
        except Exception:
            pass
        self.collection = self.client.create_collection(
            name=self.collection_name,
            metadata={"description": "Document chunks for RAG retrieval"}
        )
    except Exception as e:
        print(f"Error clearing vector store: {e}")
    finally:
        self._initialized = False
        self.initialize()
```

Add a try/except around get_status() in app.py (around line 112):

```python
try:
    status = st.session_state.pipeline.get_status()
except Exception as e:
    status = {'mode': 'unknown', 'rag_enabled': False, 'memory_enabled': False}
```

As a manual workaround when this error occurs, stop Streamlit, delete the my_vector_db/ folder, and restart:

```
rm -rf my_vector_db/
streamlit run app.py --server.port=8888
```

---

### Issue 7: ChromaDB Too Many SQL Variables When Getting Sources

When ChromaDB has many document chunks, calling collection.get() without a limit tries to retrieve all records at once, hitting SQLite's variable limit.

Replace the get_sources() method in services/vector_store.py with a batched version:

```python
def get_sources(self) -> List[str]:
    if not self._initialized:
        self.initialize()
    try:
        sources = set()
        batch_size = 100
        offset = 0
        while True:
            try:
                results = self.collection.get(limit=batch_size, offset=offset)
                if not results['ids']:
                    break
                if results['metadatas']:
                    for meta in results['metadatas']:
                        sources.add(meta.get('source', 'unknown'))
                offset += batch_size
            except Exception:
                break
        return sorted(list(sources))
    except Exception as e:
        print(f"Error getting sources: {e}")
        return []
```

---

### Issue 8: Separate Upload and Index Buttons

The original design combined upload and indexing into one action. The correct design separates them into two explicit steps so users have control over when indexing happens.

The File Manager tab in app.py was restructured into four clearly labelled sections: Step 1 (Upload Files) with a dedicated upload button, Step 2 (Index Files) with individual index buttons per file and a bulk index button, Manage Files for reindex and delete operations on already-indexed files, and Database Management for clearing and reinitializing the vector store.

---

### Complete Dependency Fix Reference

Run this sequence to install all dependencies that may be missing:

```
source venv/bin/activate
pip install langchain langchain-community langchain-text-splitters langchain-ollama
pip install chromadb sentence-transformers transformers torch accelerate
pip install nltk unstructured markdown pypdf python-docx
pip install streamlit matplotlib plotly wordcloud numpy pandas
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"
```

---

*Document compiled from project development conversation. Last updated 2024.*

